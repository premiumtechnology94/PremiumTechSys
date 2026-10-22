import React, { useState, useEffect, createContext, useContext } from 'react';
import { supabase } from './lib/supabase';

// ==========================================
// CONTEXTO DE DATOS Y CONEXIÓN A SUPABASE
// ==========================================
const AppContext = createContext();

export function AppProvider({ children }) {
  const [empresa, setEmpresa] = useState({ nombre: 'Cargando...', telefono: '', direccion: '', email: '', logoUrl: '', rutaDescargaPdf: 'Descargas predeterminadas del navegador' });
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ordenes, setOrdenes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [usuarioSesion, setUsuarioSesion] = useState(() => {
    const saved = localStorage.getItem('techfix_sesion');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const resEmp = await supabase.from('empresa').select('*').limit(1);
      if (resEmp.data && resEmp.data.length > 0) {
        setEmpresa({ 
          ...resEmp.data[0], 
          email: resEmp.data[0].email || 'contacto@syspcdoctor.com',
          logoUrl: resEmp.data[0].logo_url,
          rutaDescargaPdf: resEmp.data[0].ruta_descarga_pdf || 'Descargas predeterminadas del navegador'
        });
      } else {
        setEmpresa({ nombre: 'Taller (Falta Configurar)', telefono: '', direccion: '', email: '', logoUrl: '', rutaDescargaPdf: 'Descargas predeterminadas del navegador' });
      }

      const resRol = await supabase.from('roles').select('*');
      if (resRol.data) setRoles(resRol.data);

      const resUsr = await supabase.from('usuarios').select('*');
      if (resUsr.data) setUsuarios(resUsr.data);

      const resCli = await supabase.from('clientes').select('*');
      if (resCli.data) setClientes(resCli.data);

      const resOrd = await supabase.from('ordenes').select('*').order('id', { ascending: false });
      if (resOrd.data) setOrdenes(resOrd.data);

      const resFac = await supabase.from('facturas').select('*').order('id', { ascending: false });
      if (resFac.data) setFacturas(resFac.data);

      const resComp = await supabase.from('compras').select('*').order('id', { ascending: false });
      if (resComp.data) setCompras(resComp.data);

    } catch (error) {
      console.error("Error conectando a Supabase:", error);
    }
  };

  const login = (usr, pwd) => {
    if (usuarios.length === 0 && usr === 'admin' && pwd === 'admin123') {
      const adminEmergencia = { id: 'emergencia', nombre: 'Admin Master', usuario: 'admin', rol_id: 'emergencia' };
      setUsuarioSesion(adminEmergencia);
      localStorage.setItem('techfix_sesion', JSON.stringify(adminEmergencia));
      return true;
    }

    const encontrado = usuarios.find(u => u.usuario.toLowerCase() === usr.toLowerCase() && u.clave === pwd);
    if (encontrado) {
      setUsuarioSesion(encontrado);
      localStorage.setItem('techfix_sesion', JSON.stringify(encontrado));
      return true;
    }
    return false;
  };

  const logout = () => {
    setUsuarioSesion(null);
    localStorage.removeItem('techfix_sesion');
  };

  const rolActual = usuarioSesion ? roles.find(r => r.id === usuarioSesion.rol_id) : null;

  const generarCodigoSeguimiento = () => 'TK-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  const agregarCliente = async (data) => {
    const { data: insertado, error } = await supabase.from('clientes').insert([data]).select();
    if (error || !insertado) {
      alert('Error guardando cliente.');
      return null;
    }
    setClientes(prev => [insertado[0], ...prev]);
    return insertado[0];
  };

  const modificarCliente = async (id, data) => {
    const { error } = await supabase.from('clientes').update(data).eq('id', id);
    if (!error) {
      setClientes(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    } else {
      alert('Error actualizando cliente.');
    }
  };

  const agregarOrden = async (ordenData, clienteSeleccionado, nombreUsuario) => {
    const nueva = {
      codigo_seguimiento: generarCodigoSeguimiento(),
      cliente_nombre: clienteSeleccionado.nombre,
      cliente_telefono: clienteSeleccionado.telefono,
      cliente_email: clienteSeleccionado.email || '',
      tipo_equipo: ordenData.tipo_equipo,
      marca_modelo: ordenData.marca_modelo,
      serie: ordenData.serie || '',
      fallo_reportado: ordenData.fallo_reportado,
      deja_cargador: ordenData.deja_cargador || false,
      deja_bateria: ordenData.deja_bateria || false,
      serie_bateria: ordenData.serie_bateria || '',
      repuesto_compra_id: ordenData.repuesto_compra_id ? Number(ordenData.repuesto_compra_id) : null,
      valor_estimado: Number(ordenData.valor_estimado) || 0,
      total_pagar: 0,
      usuario_creador: nombreUsuario || 'Sistema',
      estado: 'Ingresado',
      observaciones: [{ fecha: new Date().toLocaleString('es-CO'), texto: `Orden registrada por ${nombreUsuario || 'Sistema'}.` }]
    };

    const { data: insertada, error } = await supabase.from('ordenes').insert([nueva]).select();
    if (error) {
      console.error("Error Supabase:", error);
      alert(`Error guardando la orden en la nube: ${error.message}`);
      return null;
    }
    setOrdenes(prev => [insertada[0], ...prev]);
    return insertada[0];
  };

  const actualizarOrden = async (id, estado, obs, diag, presupuesto, totalPagar, repuestoCompraId = null, remisionAsociada = null) => {
    const ordenObj = ordenes.find(o => o.id === id);
    if (!ordenObj) return;

    let obsArr = Array.isArray(ordenObj.observaciones) ? [...ordenObj.observaciones] : [];
    if (obs && obs.trim()) {
      obsArr.push({ fecha: new Date().toLocaleString('es-CO'), texto: obs.trim() });
    }

    const updateData = {
      estado,
      diagnostico: diag !== undefined ? diag : ordenObj.diagnostico,
      valor_estimado: presupuesto !== undefined ? Number(presupuesto) : ordenObj.valor_estimado,
      total_pagar: totalPagar !== undefined ? Number(totalPagar) : (ordenObj.total_pagar || 0),
      repuesto_compra_id: repuestoCompraId !== undefined ? (repuestoCompraId ? Number(repuestoCompraId) : null) : ordenObj.repuesto_compra_id,
      observaciones: obsArr,
      ...(remisionAsociada ? { numero_factura_asociada: remisionAsociada } : {})
    };

    const { error } = await supabase.from('ordenes').update(updateData).eq('id', id);
    if (!error) {
      setOrdenes(prev => prev.map(o => o.id === id ? { ...o, ...updateData } : o));
    } else {
      alert('Error al actualizar la orden en Supabase.');
    }
  };

  const agregarCompra = async (compraData, nombreUsuario) => {
    const nuevaComp = {
      proveedor: compraData.proveedor,
      descripcion_producto: compraData.descripcion_producto,
      costo: Number(compraData.costo) || 0,
      precio_venta_sugerido: Number(compraData.precio_venta_sugerido) || 0,
      fecha: new Date().toISOString().split('T')[0],
      usuario_creador: nombreUsuario || 'Sistema'
    };

    const { data: insertada, error } = await supabase.from('compras').insert([nuevaComp]).select();
    if (!error && insertada) {
      setCompras(prev => [insertada[0], ...prev]);
      return insertada[0];
    } else {
      console.error(error);
      alert('Error al registrar la compra en Supabase.');
      return null;
    }
  };

  const remisionarOrden = async (orden, nombreUsuario, itemCompraSeleccionado = null) => {
    const cliEncontrado = clientes.find(c => c.nombre.toLowerCase() === orden.cliente_nombre.toLowerCase());
    const telCliente = cliEncontrado ? cliEncontrado.telefono : (orden.cliente_telefono || 'N/A');
    
    const consecutivoNum = 10001 + facturas.length;
    const numRemisionGenerado = `REM-${consecutivoNum}`;
    const valorCobro = orden.total_pagar > 0 ? orden.total_pagar : (orden.valor_estimado || 0);

    const falloStr = orden.fallo_reportado || orden.falla_reportado || 'N/A';
    let itemsRemision = [
      { descripcion: `Servicio Técnico (${orden.tipo_equipo} - ${orden.marca_modelo}) | Fallo: ${falloStr} | Diagnóstico: ${orden.diagnostico || 'N/A'}`, cantidad: 1, precio: valorCobro }
    ];

    let costoTotalCompraAsociada = 0;

    let compraElegida = itemCompraSeleccionado;
    if (!compraElegida && orden.repuesto_compra_id) {
      compraElegida = compras.find(c => c.id.toString() === orden.repuesto_compra_id.toString());
    }

    if (compraElegida) {
      costoTotalCompraAsociada = Number(compraElegida.costo) || 0;
      itemsRemision.push({
        descripcion: `[Repuesto/Insumo de Compras]: ${compraElegida.descripcion_producto} (Proveedor: ${compraElegida.proveedor})`,
        cantidad: 1,
        precio: Number(compraElegida.precio_venta_sugerido) || 0
      });
    }

    const totalFinalFac = valorCobro + (compraElegida ? (Number(compraElegida.precio_venta_sugerido) || 0) : 0);

    const nuevaFac = {
      numero_factura: numRemisionGenerado,
      cliente_nombre: orden.cliente_nombre,
      cliente_telefono: telCliente,
      fecha: new Date().toISOString().split('T')[0],
      total: totalFinalFac,
      costo_compra: costoTotalCompraAsociada,
      tipo: 'Servicio Técnico',
      usuario_creador: nombreUsuario || 'Sistema',
      items: itemsRemision
    };

    const { data: insertada, error } = await supabase.from('facturas').insert([nuevaFac]).select();
    if (!error && insertada) {
      setFacturas(prev => [insertada[0], ...prev]);
      await actualizarOrden(orden.id, 'Entregado / Remisionado', 'Equipo entregado y remisionado bajo ' + numRemisionGenerado, orden.diagnostico, orden.valor_estimado, totalFinalFac, orden.repuesto_compra_id, numRemisionGenerado);
      return insertada[0];
    } else {
      console.error(error);
      alert('Error al generar la remisión.');
      return null;
    }
  };

  const agregarVentaDirecta = async (clienteObj, itemsArray, totalCalculado, costoCompraTotal, nombreUsuario) => {
    const nombreCliente = clienteObj ? clienteObj.nombre : 'Cliente Mostrador';
    const telefonoCliente = clienteObj ? (clienteObj.telefono || 'N/A') : 'N/A';
    
    const consecutivoNum = 10001 + facturas.length;
    const numRemisionGenerado = `REM-${consecutivoNum}`;

    const nuevaFac = {
      numero_factura: numRemisionGenerado,
      cliente_nombre: nombreCliente,
      cliente_telefono: telefonoCliente,
      fecha: new Date().toISOString().split('T')[0],
      total: totalCalculado,
      costo_compra: costoCompraTotal || 0,
      tipo: 'Venta de Repuestos',
      usuario_creador: nombreUsuario || 'Sistema',
      items: itemsArray
    };

    const { data: insertada, error } = await supabase.from('facturas').insert([nuevaFac]).select();
    if (!error && insertada) { 
      setFacturas(prev => [insertada[0], ...prev]); 
      return insertada[0]; 
    } else {
      alert('Error al generar la remisión directa.');
    }
  };

  const agregarRol = async (nombreRol, permisosObj) => {
    const { data: insertado, error } = await supabase.from('roles').insert([{ nombre: nombreRol, permisos: permisosObj }]).select();
    if (!error && insertado) setRoles(prev => [...prev, insertado[0]]);
  };

  const actualizarRol = async (idRol, permisosObj) => {
    const { error } = await supabase.from('roles').update({ permisos: permisosObj }).eq('id', idRol);
    if (!error) {
      setRoles(prev => prev.map(r => r.id === idRol ? { ...r, permisos: permisosObj } : r));
      alert('Permisos de rol actualizados con éxito.');
    } else {
      alert('Error al actualizar rol en Supabase.');
    }
  };

  const agregarUsuario = async (data) => {
    const usr = { nombre: data.nombre, usuario: data.usuario, clave: data.clave, rol_id: data.rolId };
    const { data: insertado, error } = await supabase.from('usuarios').insert([usr]).select();
    if (!error && insertado) setUsuarios(prev => [...prev, insertado[0]]);
  };

  const actualizarEmpresa = async (datos) => {
    const updateData = { 
      nombre: datos.nombre, 
      telefono: datos.telefono, 
      email: datos.email, 
      direccion: datos.direccion, 
      logo_url: datos.logoUrl,
      ruta_descarga_pdf: datos.rutaDescargaPdf
    };
    const { data: ext } = await supabase.from('empresa').select('id').limit(1);
    
    if (ext && ext.length > 0) {
      await supabase.from('empresa').update(updateData).eq('id', ext[0].id);
    } else {
      await supabase.from('empresa').insert([updateData]);
    }
    setEmpresa(datos);
  };

  return (
    <AppContext.Provider value={{
      empresa, setEmpresa: actualizarEmpresa, roles, agregarRol, actualizarRol, usuarios, agregarUsuario,
      usuarioSesion, login, logout, rolActual,
      clientes, agregarCliente, modificarCliente,
      ordenes, agregarOrden, actualizarOrden,
      facturas, remisionarOrden, agregarVentaDirecta,
      compras, agregarCompra
    }}>
      {children}
    </AppContext.Provider>
  );
}

const useApp = () => useContext(AppContext);

function LoginScreen() {
  const { login, empresa } = useApp();
  const [usr, setUsr] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(usr, pwd)) setError(false);
    else setError(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          {empresa.logoUrl ? (
            <img src={empresa.logoUrl} alt="Logo" className="w-32 h-32 object-contain mx-auto rounded-xl bg-slate-800 p-2 border border-slate-700 shadow-lg" />
          ) : (
            <div className="w-24 h-24 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-3xl mx-auto shadow-lg shadow-indigo-600/30">TF</div>
          )}
          <h1 className="text-xl font-bold text-white">{empresa.nombre}</h1>
          <p className="text-xs text-slate-400">Ingresa tus credenciales para acceder al taller</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Usuario</label>
            <input type="text" placeholder="Ej. admin" className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" value={usr} onChange={e => setUsr(e.target.value)} required />
          </div>
          <div>
            <label className="text-slate-300 font-semibold block mb-1">Contraseña</label>
            <input type="password" placeholder="••••••••" className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" value={pwd} onChange={e => setPwd(e.target.value)} required />
          </div>
          {error && <p className="text-rose-400 text-[11px] font-bold text-center">Usuario o contraseña incorrectos.</p>}
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded-xl text-xs text-white transition shadow-lg shadow-indigo-600/30">Iniciar Sesión</button>
        </form>
      </div>
    </div>
  );
}

function MainApp() {
  const {
    empresa, clientes, ordenes, facturas, compras, agregarCompra, roles, agregarRol, actualizarRol, usuarios, agregarUsuario,
    usuarioSesion, logout, rolActual,
    agregarCliente, modificarCliente, agregarOrden, actualizarOrden,
    remisionarOrden, agregarVentaDirecta, setEmpresa
  } = useApp();

  const [tab, setTab] = useState('ordenes');
  const [modalEditOrden, setModalEditOrden] = useState(null);
  const [modalEditCliente, setModalEditCliente] = useState(null);
  const [verHistorialCliente, setVerHistorialCliente] = useState(null);
  const [modalVenta, setModalVenta] = useState(false);
  const [modalCompra, setModalCompra] = useState(false);
  const [modalRemisionarOrden, setModalRemisionarOrden] = useState(null);
  const [modalReporteExcel, setModalReporteExcel] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [documentoImprimir, setDocumentoImprimir] = useState(null);
  
  const [ocultarUtilidad, setOcultarUtilidad] = useState(() => {
    const saved = localStorage.getItem('techfix_ocultar_utilidad');
    return saved ? JSON.parse(saved) : false;
  });

  const toggleOcultarUtilidad = () => {
    const nuevoEstado = !ocultarUtilidad;
    setOcultarUtilidad(nuevoEstado);
    localStorage.setItem('techfix_ocultar_utilidad', JSON.stringify(nuevoEstado));
  };
  
  const [reporteFiltro, setReporteFiltro] = useState({
    fechaInicio: new Date().toISOString().split('T')[0],
    fechaFin: new Date().toISOString().split('T')[0],
    tipo: 'AMBOS'
  });

  const [tipoClienteOpt, setTipoClienteOpt] = useState('EXISTENTE');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaDirectorioClientes, setBusquedaDirectorioClientes] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [formNuevoCliente, setFormNuevoCliente] = useState({ nombre: '', telefono: '', cedula: '', email: '', direccion: '' });
  
  const [formOrden, setFormOrden] = useState({ 
    tipo_equipo: 'PORTATIL', 
    marca_modelo: '', 
    serie: '', 
    fallo_reportado: '', 
    valor_estimado: 0,
    deja_cargador: false,
    deja_bateria: false,
    serie_bateria: '',
    repuesto_compra_id: ''
  });

  const [editOrdForm, setEditOrdForm] = useState({ estado: '', observacion: '', diagnostico: '', presupuesto: 0, totalPagar: 0, repuestoCompraId: '' });
  
  const [tipoClienteVentaOpt, setTipoClienteVentaOpt] = useState('EXISTENTE');
  const [busquedaClienteVenta, setBusquedaClienteVenta] = useState('');
  const [clienteVentaSeleccionado, setClienteVentaSeleccionado] = useState(null);
  const [formNuevoClienteVenta, setFormNuevoClienteVenta] = useState({ nombre: '', telefono: '', cedula: '', email: '', direccion: '' });
  const [itemsVenta, setItemsVenta] = useState([{ descripcion: '', cantidad: 1, precio: 0 }]);
  const [compraSeleccionadaVentaId, setCompraSeleccionadaVentaId] = useState('');

  const [formCompra, setFormCompra] = useState({ proveedor: '', descripcion_producto: '', costo: 0, precio_venta_sugerido: 0 });
  const [mostrarHistorialPortal, setMostrarHistorialPortal] = useState(false);

  const [formNuevoRol, setFormNuevoRol] = useState({ nombre: '', permisos: { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, ver_configuracion: true } });
  const [formUsuarioNuevo, setFormUsuarioNuevo] = useState({ nombre: '', usuario: '', clave: '', rolId: roles[0]?.id || '' });

  const normalizarBusqueda = (valor) => String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const terminoBusquedaDirectorio = normalizarBusqueda(busquedaDirectorioClientes);
  const clientesFiltradosDirectorio = clientes.filter(c => {
    if (!terminoBusquedaDirectorio) return true;

    const nombre = normalizarBusqueda(c.nombre);
    const cedula = normalizarBusqueda(c.cedula);
    const telefono = normalizarBusqueda(c.telefono);

    return nombre.includes(terminoBusquedaDirectorio) ||
      cedula.includes(terminoBusquedaDirectorio) ||
      telefono.includes(terminoBusquedaDirectorio);
  });

  const clientesFiltradosBusqueda = clientes.filter(c => c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) || String(c.telefono || '').includes(busquedaCliente));
  const clientesFiltradosVenta = clientes.filter(c => c.nombre.toLowerCase().includes(busquedaClienteVenta.toLowerCase()) || String(c.telefono || '').includes(busquedaClienteVenta));

  const enviarWhatsApp = (orden, idConsecutivoStr) => {
    const msg = `Hola *${orden.cliente_nombre}* 👋\n\nTe saludamos de *${empresa.nombre}*.\n\nTu orden *${idConsecutivoStr}* (*${orden.tipo_equipo} ${orden.marca_modelo}*) se encuentra en estado: *${orden.estado}*.\n\nPuedes consultar el avance, diagnóstico y estado de tu equipo ingresando a nuestra plataforma:\n🔗 https://syspcdoctor.vercel.app/portal\n\nUtiliza tu código único: *${orden.codigo_seguimiento}*`;
    window.open(`https://wa.me/57${orden.cliente_telefono}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const exportarClientesCSV = () => {
    let csv = 'Nombre,Telefono,Cedula,Email,Direccion\n';
    clientes.forEach(c => csv += `"${c.nombre}","${c.telefono}","${c.cedula || ''}","${c.email || ''}","${c.direccion || ''}"\n`);
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `clientes_taller.csv`;
    a.click();
  };

  const generarReporteExcel = () => {
    const { fechaInicio, fechaFin, tipo } = reporteFiltro;

    const filtradas = facturas.filter(f => {
      const fechaF = f.fecha; 
      const cumpleFecha = fechaF >= fechaInicio && fechaF <= fechaFin;
      if (!cumpleFecha) return false;

      if (tipo === 'VENTAS') return f.tipo === 'Venta de Repuestos';
      if (tipo === 'REPARACIONES') return f.tipo === 'Servicio Técnico';
      return true; 
    });

    if (filtradas.length === 0) {
      alert('No hay registros en el rango de fechas seleccionado.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; 
    csvContent += "Remision/Documento,Fecha,Tipo,Cliente,Telefono,Vendedor,Costo Invertido,Total Venta,Utilidad Real\n";

    let sumaTotalVentas = 0;
    let sumaTotalCostos = 0;
    let sumaTotalGanancias = 0;

    filtradas.forEach(f => {
      const totalVenta = Number(f.total || 0);
      const costoCompra = Number(f.costo_compra || 0);
      const ganancia = totalVenta - costoCompra;

      sumaTotalVentas += totalVenta;
      sumaTotalCostos += costoCompra;
      sumaTotalGanancias += ganancia;

      const linea = `"${f.numero_factura}","${f.fecha}","${f.tipo}","${f.cliente_nombre}","${f.cliente_telefono || 'N/A'}","${f.usuario_creador || 'Sistema'}","$${costoCompra}","$${totalVenta}","$${ganancia}"`;
      csvContent += linea + "\r\n";
    });

    csvContent += `\r\n,,, ,TOTALES DEL PERIODO:,"$${sumaTotalCostos}","$${sumaTotalVentas}","$${sumaTotalGanancias}"\r\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_financiero_remisiones_${fechaInicio}_al_${fechaFin}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setModalReporteExcel(false);
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setEmpresa({ ...empresa, logoUrl: reader.result });
      reader.readAsDataURL(file);
    }
  };

  const permisosRol = rolActual ? (typeof rolActual.permisos === 'string' ? JSON.parse(rolActual.permisos) : rolActual.permisos) : {};
  
  const permisos = usuarioSesion?.id === 'emergencia' || (rolActual && rolActual.nombre?.toLowerCase().includes('admin'))
    ? { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, ver_configuracion: true }
    : {
        crear_orden: permisosRol.crear_orden ?? true,
        editar_diagnostico: permisosRol.editar_diagnostico ?? true,
        ver_clientes: permisosRol.ver_clientes ?? true,
        editar_clientes: permisosRol.editar_clientes ?? true,
        facturar: permisosRol.facturar ?? true,
        ver_configuracion: permisosRol.ver_configuracion ?? true,
    };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      
      {/* BARRA LATERAL */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 p-5 space-y-6 flex flex-col justify-between shrink-0 no-imprimir">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {empresa.logoUrl ? (
              <img src={empresa.logoUrl} alt="Logo" className="w-10 h-10 object-contain rounded-lg bg-slate-800 border border-slate-700 p-0.5" />
            ) : (
              <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-white text-lg">TF</div>
            )}
            <div>
              <h1 className="text-sm font-extrabold text-indigo-400 leading-tight">{empresa.nombre}</h1>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Taller & Ventas</span>
            </div>
          </div>

          <nav className="space-y-1.5 text-xs font-semibold">
            {permisos.crear_orden && <button onClick={() => setTab('nueva_orden')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'nueva_orden' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>➕ Nueva Orden de Entrada</button>}
            <button onClick={() => setTab('ordenes')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'ordenes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🛠️ Reparaciones y Estado</button>
            {permisos.ver_clientes && <button onClick={() => setTab('clientes')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'clientes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>👥 Directorio de Clientes</button>}
            {permisos.facturar && <button onClick={() => setTab('facturacion')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'facturacion' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🧾 Remisiones y Ventas</button>}
            {permisos.facturar && <button onClick={() => setTab('compras')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'compras' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🛒 Compras y Gastos</button>}
            <button onClick={() => setTab('portal')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'portal' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🔍 Portal Consulta Cliente</button>
            {permisos.ver_configuracion && <button onClick={() => setTab('config')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'config' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>⚙️ Configuración & Permisos</button>}
          </nav>
        </div>
        <div className="pt-4 border-t border-slate-800 text-xs space-y-2">
          <div><p className="text-white font-bold">{usuarioSesion?.nombre}</p><p className="text-[10px] text-indigo-400 font-semibold">{rolActual?.nombre || 'Administrador Sistema'}</p></div>
          <button onClick={logout} className="w-full bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-300 font-bold p-2 rounded-xl text-center transition border border-slate-700">🚪 Cerrar Sesión</button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full no-imprimir">
        
        {/* 1. CREACIÓN DE NUEVA ORDEN */}
        {tab === 'nueva_orden' && permisos.crear_orden && (
          <div className="max-w-2xl mx-auto bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl space-y-5">
            <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-3">Registrar Orden de Entrada</h2>
            <div className="space-y-3">
              <label className="text-xs font-bold text-indigo-400 uppercase">Selección de Cliente</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setTipoClienteOpt('EXISTENTE'); setClienteSeleccionado(null); }} className={`p-2.5 rounded-xl text-xs font-bold border transition ${tipoClienteOpt === 'EXISTENTE' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Buscar Cliente Existente</button>
                <button type="button" onClick={() => { setTipoClienteOpt('NUEVO'); setClienteSeleccionado(null); }} className={`p-2.5 rounded-xl text-xs font-bold border transition ${tipoClienteOpt === 'NUEVO' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>+ Registrar Cliente Nuevo</button>
              </div>

              {tipoClienteOpt === 'EXISTENTE' && (
                <div className="space-y-2 pt-2">
                  {!clienteSeleccionado ? (
                    <div className="relative">
                      <input type="text" placeholder="Buscar por Nombre o Celular..." className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-xs text-white" value={busquedaCliente} onChange={e => setBusquedaCliente(e.target.value)} />
                      {busquedaCliente.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 max-h-40 overflow-y-auto">
                          {clientesFiltradosBusqueda.length > 0 ? clientesFiltradosBusqueda.map(c => (
                            <div key={c.id} onClick={() => { setClienteSeleccionado(c); setBusquedaCliente(''); }} className="p-2.5 hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-700/50">
                              <p className="font-bold text-white">{c.nombre}</p><p className="text-[11px] text-indigo-400">Tel: {c.telefono}</p>
                            </div>
                          )) : <p className="p-3 text-xs text-slate-500">No se encontraron coincidencias.</p>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-indigo-950/60 border border-indigo-700/60 p-3 rounded-xl flex justify-between items-center text-xs">
                      <div><p className="font-bold text-white">{clienteSeleccionado.nombre}</p><p className="text-indigo-300">Tel: {clienteSeleccionado.telefono}</p></div>
                      <button onClick={() => setClienteSeleccionado(null)} className="text-slate-400 hover:text-white font-bold text-xs">Cambiar</button>
                    </div>
                  )}
                </div>
              )}

              {tipoClienteOpt === 'NUEVO' && (
                <div className="space-y-2 pt-2 bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                  <input placeholder="Nombre Completo *" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.nombre} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, nombre: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Teléfono / WhatsApp *" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.telefono} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono: e.target.value })} />
                    <input placeholder="Cédula" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.cedula} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, cedula: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Correo Electrónico" type="email" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.email} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, email: e.target.value })} />
                    <input placeholder="Dirección" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.direccion} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, direccion: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-bold text-indigo-400 uppercase">2. Detalles del Equipo</label>
              <select className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formOrden.tipo_equipo} onChange={e => setFormOrden({ ...formOrden, tipo_equipo: e.target.value })}>
                <option value="PORTATIL">Portátil / Laptop</option>
                <option value="CPU">CPU / Escritorio</option>
                <option value="VARIOS">Monitor / Varios</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Marca y Modelo *" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formOrden.marca_modelo} onChange={e => setFormOrden({ ...formOrden, marca_modelo: e.target.value })} />
                <input placeholder="N° de Serie (S/N Equipo)" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formOrden.serie} onChange={e => setFormOrden({ ...formOrden, serie: e.target.value })} />
              </div>

              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700/80 space-y-3">
                <div className="flex gap-6 text-xs text-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-indigo-600 rounded" 
                      checked={formOrden.deja_cargador} 
                      onChange={e => setFormOrden({ ...formOrden, deja_cargador: e.target.checked })} 
                    />
                    🔌 ¿Deja Cargador?
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-bold">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 accent-indigo-600 rounded" 
                      checked={formOrden.deja_bateria} 
                      onChange={e => setFormOrden({ ...formOrden, deja_bateria: e.target.checked })} 
                    />
                    🔋 ¿Deja Batería?
                  </label>
                </div>
                {formOrden.deja_bateria && (
                  <div>
                    <input 
                      placeholder="N° de Serie (S/N) de la Batería" 
                      className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" 
                      value={formOrden.serie_bateria} 
                      onChange={e => setFormOrden({ ...formOrden, serie_bateria: e.target.value })} 
                    />
                  </div>
                )}
              </div>

              <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
                <label className="text-xs font-bold text-amber-400 block mb-1">🛒 Asociar Repuesto/Insumo de Compras (Opcional)</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white"
                  value={formOrden.repuesto_compra_id}
                  onChange={e => setFormOrden({ ...formOrden, repuesto_compra_id: e.target.value })}
                >
                  <option value="">-- Ninguno --</option>
                  {compras.map(c => (
                    <option key={c.id} value={c.id}>{c.descripcion_producto} (Proveedor: {c.proveedor} - Venta Sugerida: ${c.precio_venta_sugerido})</option>
                  ))}
                </select>
              </div>

              <textarea placeholder="Síntomas / Fallo reportado *" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" rows={2} value={formOrden.fallo_reportado} onChange={e => setFormOrden({ ...formOrden, fallo_reportado: e.target.value })} />
              <input type="number" placeholder="Presupuesto Estimado ($ COP) - Opcional" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formOrden.valor_estimado} onChange={e => setFormOrden({ ...formOrden, valor_estimado: e.target.value })} />
            </div>

            <button
              onClick={async () => {
                let targetClient = clienteSeleccionado;
                if (tipoClienteOpt === 'NUEVO') {
                  if (!formNuevoCliente.nombre || !formNuevoCliente.telefono) return alert('Ingresa el nombre y teléfono del cliente.');
                  targetClient = await agregarCliente(formNuevoCliente);
                }
                if (!targetClient) return alert('Selecciona o registra un cliente.');
                if (!formOrden.marca_modelo || !formOrden.fallo_reportado) return alert('Completa los datos del equipo.');

                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                const nueva = await agregarOrden(formOrden, targetClient, nombreUsrActual);
                if (nueva) {
                  alert(`¡Orden registrada!\nCódigo Cliente: ${nueva.codigo_seguimiento}`);
                  const idConsecutivoStr = `#${1001 + (ordenes.length)}`;
                  setDocumentoImprimir({ tipo: 'ORDEN', data: nueva, idConsecutivo: idConsecutivoStr });
                  setTab('ordenes');
                  setClienteSeleccionado(null);
                  setFormNuevoCliente({ nombre: '', telefono: '', cedula: '', email: '', direccion: '' });
                  setFormOrden({ tipo_equipo: 'PORTATIL', marca_modelo: '', serie: '', fallo_reportado: '', valor_estimado: 0, deja_cargador: false, deja_bateria: false, serie_bateria: '', repuesto_compra_id: '' });
                }
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-500 font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-indigo-600/30 text-white"
            >
              Guardar e Imprimir Orden
            </button>
          </div>
        )}

        {/* 2. TABLA REPARACIONES */}
        {tab === 'ordenes' && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <h2 className="text-xl font-bold text-white">Seguimiento de Reparaciones</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400 uppercase">
                  <tr><th className="p-3">ID Registro</th><th className="p-3">Código Cliente</th><th className="p-3">Cliente / Atendió</th><th className="p-3">Equipo & Accesorios</th><th className="p-3">Estado</th><th className="p-3">Presupuesto / Total Pagar</th><th className="p-3 text-right">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {ordenes.map((o, index) => {
                    const idRegistroConsecutivo = `#${1001 + (ordenes.length - 1 - index)}`;
                    return (
                      <tr key={o.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-indigo-400">{idRegistroConsecutivo}</td>
                        <td className="p-3 font-mono text-xs text-amber-400 bg-amber-950/30 px-2 py-0.5 rounded border border-amber-800/40">{o.codigo_seguimiento}</td>
                        <td className="p-3 font-medium text-white">
                          {o.cliente_nombre}
                          <span className="block text-[10px] text-slate-500">{o.cliente_telefono}</span>
                          <span className="block text-[10px] text-indigo-300 font-semibold mt-0.5">👤 Atendió: {o.usuario_creador || 'Sistema'}</span>
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-white">{o.tipo_equipo} {o.marca_modelo}</p>
                          <p className="text-[10px] text-slate-400">S/N: {o.serie || 'N/A'}</p>
                          <div className="flex gap-2 mt-1 text-[10px]">
                            {o.deja_cargador && <span className="bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800">🔌 Cargador</span>}
                            {o.deja_bateria && <span className="bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800">🔋 Batería {o.serie_bateria ? `(${o.serie_bateria})` : ''}</span>}
                          </div>
                        </td>
                        <td className="p-3"><span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">{o.estado}</span></td>
                        <td className="p-3 font-bold text-white">
                          <div className="space-y-0.5">
                            <span className="text-slate-400 text-[11px] block">Presupuesto: {o.valor_estimado ? `$ ${Number(o.valor_estimado).toLocaleString('es-CO')}` : '-'}</span>
                            <span className="text-emerald-400 text-[11px] block">Total Pagar: {o.total_pagar ? `$ ${Number(o.total_pagar).toLocaleString('es-CO')}` : '-'}</span>
                          </div>
                          {o.numero_factura_asociada && (
                            <span className="block text-[11px] text-indigo-400 font-mono mt-1">Remisión: {o.numero_factura_asociada}</span>
                          )}
                        </td>
                        <td className="p-3 text-right space-x-1">
                          {permisos.editar_diagnostico && <button onClick={() => { setModalEditOrden(o); setEditOrdForm({ estado: o.estado, observacion: '', diagnostico: o.diagnostico || '', presupuesto: o.valor_estimado || 0, totalPagar: o.total_pagar || 0, repuestoCompraId: o.repuesto_compra_id || '' }); }} className="bg-indigo-600 text-white px-2 py-1 rounded text-[11px]">✏️ Diagnóstico</button>}
                          <button onClick={() => enviarWhatsApp(o, idRegistroConsecutivo)} className="bg-emerald-600 text-white px-2 py-1 rounded text-[11px]">💬 WhatsApp</button>
                          <button onClick={() => setDocumentoImprimir({ tipo: 'ORDEN', data: o, idConsecutivo: idRegistroConsecutivo })} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">🖨️ PDF</button>
                          {o.estado === 'Reparado / Listo' && permisos.facturar && <button onClick={() => setModalRemisionarOrden({ orden: o, compraId: o.repuesto_compra_id || '' })} className="bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-bold">📄 Remisionar</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. CLIENTES */}
        {tab === 'clientes' && permisos.ver_clientes && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-white">Directorio de Clientes</h2><div className="space-x-2"><button onClick={exportarClientesCSV} className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl text-xs">📊 Exportar</button>{permisos.editar_clientes && <button onClick={() => { setModalEditCliente({}); setFormNuevoCliente({ nombre: '', telefono: '', cedula: '', email: '', direccion: '' }); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold">+ Nuevo Cliente</button>}</div></div>
            {clientes.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs space-y-2">
                <p className="text-sm font-semibold text-slate-300">No hay clientes registrados en esta empresa todavía.</p>
                <p>Haz clic en el botón <strong>+ Nuevo Cliente</strong> o registra una nueva orden para que aparezcan aquí.</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <input
                    type="text"
                    value={busquedaDirectorioClientes}
                    onChange={e => setBusquedaDirectorioClientes(e.target.value)}
                    placeholder="🔍 Buscar por nombre, cédula o número de celular..."
                    aria-label="Buscar clientes por nombre, cédula o celular"
                    className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {busquedaDirectorioClientes && (
                    <button
                      type="button"
                      onClick={() => setBusquedaDirectorioClientes('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                      aria-label="Limpiar búsqueda"
                    >
                      ✕ Limpiar
                    </button>
                  )}
                  <p className="text-[11px] text-slate-500 mt-2">
                    {clientesFiltradosDirectorio.length} de {clientes.length} clientes
                  </p>
                </div>

                {clientesFiltradosDirectorio.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    No se encontraron clientes con ese nombre, cédula o número de celular.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-800 text-slate-400 uppercase">
                        <tr>
                          <th className="p-3">Cliente</th>
                          <th className="p-3">Cédula</th>
                          <th className="p-3">Teléfono</th>
                          <th className="p-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {clientesFiltradosDirectorio.map(c => (
                          <tr key={c.id} className="hover:bg-slate-800/40">
                            <td className="p-3 font-bold text-white">{c.nombre}</td>
                            <td className="p-3 text-slate-300">{c.cedula || '—'}</td>
                            <td className="p-3 text-indigo-400">{c.telefono || '—'}</td>
                            <td className="p-3 text-right space-x-1">
                              {permisos.editar_clientes && <button onClick={() => { setModalEditCliente(c); setFormNuevoCliente({ nombre: c.nombre || '', telefono: c.telefono || '', cedula: c.cedula || '', email: c.email || '', direccion: c.direccion || '' }); }} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">✏️ Editar</button>}
                              <button onClick={() => setVerHistorialCliente(c)} className="bg-indigo-600 text-white px-2 py-1 rounded text-[11px]">📜 Historial</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 4. REMISIONES Y VENTAS */}
        {tab === 'facturacion' && permisos.facturar && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h2 className="text-xl font-bold text-white">Remisiones y Ventas</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={toggleOcultarUtilidad} 
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                    ocultarUtilidad 
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20' 
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                  title="Ocultar o mostrar las utilidades en pantalla"
                >
                  {ocultarUtilidad ? '🔒 Utilidad Oculta' : '👁️ Ocultar Utilidad'}
                </button>
                <button onClick={() => setModalReporteExcel(true)} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition">📊 Descargar Reporte Excel</button>
                <button onClick={() => { setModalVenta(true); setTipoClienteVentaOpt('EXISTENTE'); setClienteVentaSeleccionado(null); setCompraSeleccionadaVentaId(''); }} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-bold">+ Venta Directa</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400 uppercase">
                  <tr>
                    <th className="p-3">Remisión N°</th>
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Cliente / Vendedor</th>
                    <th className="p-3">Total Venta</th>
                    {!ocultarUtilidad && <th className="p-3">Utilidad</th>}
                    <th className="p-3 text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {facturas.map(f => {
                    const totalVenta = Number(f.total || 0);
                    const costoCompra = Number(f.costo_compra || 0);
                    const utilidad = totalVenta - costoCompra;

                    return (
                      <tr key={f.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-indigo-400">{f.numero_factura}</td>
                        <td className="p-3 text-slate-400">{f.fecha}</td>
                        <td className="p-3 font-medium text-white">
                          {f.cliente_nombre}
                          <span className="block text-[10px] text-indigo-300 font-semibold mt-0.5">👤 Vendedor: {f.usuario_creador || 'Sistema'}</span>
                        </td>
                        <td className="p-3 font-extrabold text-white">$ {totalVenta.toLocaleString('es-CO')}</td>
                        
                        {!ocultarUtilidad && (
                          <td className="p-3 font-extrabold text-emerald-400">$ {utilidad.toLocaleString('es-CO')}</td>
                        )}

                        <td className="p-3 text-right space-x-1">
                          <button onClick={() => setFacturaSeleccionada(f)} className="bg-indigo-600 text-white px-2 py-1 rounded text-[11px]">👁️ Ver</button>
                          <button onClick={() => setDocumentoImprimir({ tipo: 'FACTURA', data: f })} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">🖨️ PDF</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. COMPRAS Y GASTOS */}
        {tab === 'compras' && permisos.facturar && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">Compras y Gastos del Local</h2>
                <p className="text-xs text-slate-400">Registra repuestos e insumos comprados para usar o revender a clientes.</p>
              </div>
              <button onClick={() => { setModalCompra(true); setFormCompra({ proveedor: '', descripcion_producto: '', costo: 0, precio_venta_sugerido: 0 }); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition">+ Registrar Compra</button>
            </div>
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-800 text-slate-400 uppercase"><tr><th className="p-3">Fecha</th><th className="p-3">Proveedor</th><th className="p-3">Producto / Repuesto</th><th className="p-3">Costo Invertido</th><th className="p-3">Precio Venta Sugerido</th><th className="p-3">Registró</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {compras.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="p-3 text-slate-400">{c.fecha}</td>
                    <td className="p-3 font-bold text-white">{c.proveedor}</td>
                    <td className="p-3 text-indigo-300">{c.descripcion_producto}</td>
                    <td className="p-3 font-bold text-rose-400">$ {(c.costo || 0).toLocaleString('es-CO')}</td>
                    <td className="p-3 font-bold text-emerald-400">$ {(c.precio_venta_sugerido || 0).toLocaleString('es-CO')}</td>
                    <td className="p-3 text-slate-400">{c.usuario_creador || 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 6. PORTAL DEL CLIENTE INTERNO */}
        {tab === 'portal' && (
          <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4 text-center">
            {empresa.logoUrl ? (
              <img src={empresa.logoUrl} alt="Logo" className="w-32 h-32 object-contain mx-auto rounded-xl bg-slate-800 p-2 border border-slate-700 shadow-lg" />
            ) : (
              <div className="w-24 h-24 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-3xl mx-auto shadow-lg shadow-indigo-600/30">TF</div>
            )}
            <h2 className="text-xl font-bold text-white">{empresa.nombre}</h2>
            <p className="text-xs text-slate-400">Portal Público de Consulta de Estado de Reparación</p>
            <div className="flex gap-2">
              <input
                placeholder="Ingresa el Código (ej. TK-89A1)"
                className="flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white text-center font-bold font-mono tracking-wider uppercase"
                value={busquedaCliente}
                onChange={e => setBusquedaCliente(e.target.value)}
              />
              <button
                onClick={() => {
                  const clean = busquedaCliente.trim().toUpperCase();
                  const res = ordenes.find(o => o.codigo_seguimiento && o.codigo_seguimiento.toUpperCase() === clean);
                  setClienteSeleccionado(res || 'NO_ENCONTRADO');
                  setMostrarHistorialPortal(false);
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold"
              >
                Consultar
              </button>
            </div>

            {clienteSeleccionado && clienteSeleccionado !== 'NO_ENCONTRADO' && (
              <div className="text-left bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-3 text-xs">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <span className="font-bold text-indigo-400">Estado: {clienteSeleccionado.estado}</span>
                  <span className="font-mono text-[11px] text-amber-400">Código: {clienteSeleccionado.codigo_seguimiento}</span>
                </div>
                <p><strong className="text-white">Equipo:</strong> {clienteSeleccionado.tipo_equipo} {clienteSeleccionado.marca_modelo} (S/N: {clienteSeleccionado.serie || 'N/A'})</p>
                <p className="text-slate-300"><strong>Accesorios:</strong> {clienteSeleccionado.deja_cargador ? '🔌 Cargador ' : ''} {clienteSeleccionado.deja_bateria ? `🔋 Batería (${clienteSeleccionado.serie_bateria || 'S/N'})` : ''} {!clienteSeleccionado.deja_cargador && !clienteSeleccionado.deja_bateria ? 'Ninguno' : ''}</p>
                <p><strong className="text-white">Fallo Reportado:</strong> {clienteSeleccionado.fallo_reportado || clienteSeleccionado.falla_reportado}</p>
                <p><strong className="text-white">Diagnóstico Técnico:</strong> {clienteSeleccionado.diagnostico || 'Equipo en proceso de revisión.'}</p>
                
                {clienteSeleccionado.numero_factura_asociada && (
                  <p><strong className="text-indigo-400">Remisión Asociada:</strong> <span className="text-indigo-300 font-mono font-bold">{clienteSeleccionado.numero_factura_asociada}</span></p>
                )}

                {Number(clienteSeleccionado.valor_estimado) > 0 && (
                  <p><strong className="text-white">Presupuesto Estimado:</strong> $ {Number(clienteSeleccionado.valor_estimado).toLocaleString('es-CO')}</p>
                )}

                {Number(clienteSeleccionado.total_pagar) > 0 && (
                  <p className="bg-emerald-950/40 border border-emerald-800/50 p-2.5 rounded-xl"><strong className="text-emerald-400">Total a Pagar:</strong> <span className="text-emerald-300 font-extrabold">$ {Number(clienteSeleccionado.total_pagar).toLocaleString('es-CO')}</span></p>
                )}

                <div className="pt-2 border-t border-slate-700">
                  <button 
                    onClick={() => setMostrarHistorialPortal(!mostrarHistorialPortal)} 
                    className="w-full flex justify-between items-center text-xs font-bold text-indigo-400 bg-slate-800/80 p-2.5 rounded-xl border border-slate-700 transition hover:bg-slate-800"
                  >
                    <span>📜 Ver historial de avances y procesos</span>
                    <span>{mostrarHistorialPortal ? '▲' : '▼'}</span>
                  </button>

                  {mostrarHistorialPortal && (
                    <div className="mt-2 space-y-1.5 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
                      {(Array.isArray(clienteSeleccionado.observaciones) ? clienteSeleccionado.observaciones : []).length > 0 ? (
                        clienteSeleccionado.observaciones.map((obs, idx) => (
                          <p key={idx} className="text-[11px] text-slate-300">🔹 <span className="text-slate-500 font-mono">[{obs.fecha}]</span> {obs.texto}</p>
                        ))
                      ) : (
                        <p className="text-[11px] text-slate-500">Sin registros en el historial aún.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {clienteSeleccionado === 'NO_ENCONTRADO' && <p className="text-xs text-amber-400">No se encontró ninguna orden con ese código.</p>}

            <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
              <p className="font-bold text-slate-300">{empresa.nombre}</p>
              {empresa.direccion && <p>📍 Dirección: {empresa.direccion}</p>}
              {empresa.telefono && <p>📞 Teléfono: {empresa.telefono}</p>}
              {empresa.email && <p>✉️ Correo: {empresa.email}</p>}
            </div>
          </div>
        )}

        {/* 7. CONFIGURACIÓN & PERMISOS */}
        {tab === 'config' && permisos.ver_configuracion && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">Perfil de Empresa en Nube</h2>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400">Logo</label>
                  <div className="flex items-center gap-3 mt-1">{empresa.logoUrl && <img src={empresa.logoUrl} className="w-16 h-16 object-contain bg-slate-800 border rounded-lg p-1" />} <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs text-white file:bg-indigo-600 file:text-white file:rounded-xl file:border-0 file:px-3 file:py-1.5 cursor-pointer" /></div>
                </div>
                <div><label className="text-slate-400">Nombre de la Empresa</label><input className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={empresa.nombre} onChange={e => setEmpresa({ ...empresa, nombre: e.target.value })} /></div>
                
                <div>
                  <label className="text-slate-400 font-bold block mb-1">📁 Carpeta / Ruta predeterminada de descarga de PDF para WhatsApp</label>
                  <input className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={empresa.rutaDescargaPdf} onChange={e => setEmpresa({ ...empresa, rutaDescargaPdf: e.target.value })} placeholder="Ej. C:/Users/TuUsuario/Downloads" />
                  <p className="text-[11px] text-slate-500 mt-1">Nota: Los navegadores descargan por defecto en la carpeta de descargas configurada en tu navegador web.</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div><label className="text-slate-400">Teléfono</label><input className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={empresa.telefono} onChange={e => setEmpresa({ ...empresa, telefono: e.target.value })} /></div>
                  <div><label className="text-slate-400">Correo</label><input className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={empresa.email} onChange={e => setEmpresa({ ...empresa, email: e.target.value })} /></div>
                  <div><label className="text-slate-400">Dirección</label><input className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={empresa.direccion} onChange={e => setEmpresa({ ...empresa, direccion: e.target.value })} /></div>
                </div>
                <button onClick={async () => { await setEmpresa(empresa); alert('Guardado en la Nube'); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">Guardar Cambios</button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-slate-800 pb-2">Gestión de Perfiles (Roles) y Permisos</h2>
              
              <div className="space-y-4">
                <p className="text-xs font-bold text-indigo-400 uppercase">Perfiles Existentes en el Sistema</p>
                <div className="space-y-3">
                  {roles.map(r => {
                    const currentPerms = typeof r.permisos === 'string' ? JSON.parse(r.permisos) : (r.permisos || {});
                    return (
                      <div key={r.id} className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-3 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-extrabold text-white text-sm">🛡️ {r.nombre}</span>
                          <button 
                            onClick={async () => {
                              await actualizarRol(r.id, currentPerms);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Guardar Cambios de este Rol
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-300 pt-1">
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!currentPerms.crear_orden} 
                              onChange={e => {
                                const updated = { ...currentPerms, crear_orden: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }} 
                            /> Crear Órdenes
                          </label>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!currentPerms.editar_diagnostico} 
                              onChange={e => {
                                const updated = { ...currentPerms, editar_diagnostico: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }} 
                            /> Modificar Diagnóstico
                          </label>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!currentPerms.ver_clientes} 
                              onChange={e => {
                                const updated = { ...currentPerms, ver_clientes: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }} 
                            /> Ver Clientes
                          </label>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!currentPerms.facturar} 
                              onChange={e => {
                                const updated = { ...currentPerms, facturar: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }} 
                            /> Remisiones, Ventas y Compras
                          </label>
                          <label className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={!!currentPerms.ver_configuracion} 
                              onChange={e => {
                                const updated = { ...currentPerms, ver_configuracion: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }} 
                            /> Configuración
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-800/40 p-4 rounded-xl border border-slate-800 space-y-3 text-xs pt-4 border-t border-slate-700">
                <p className="font-bold text-indigo-400 uppercase">+ Crear Nuevo Perfil (Rol)</p>
                <input placeholder="Nombre de Perfil (ej. Técnico Junior, Cajero)" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formNuevoRol.nombre} onChange={e => setFormNuevoRol({ ...formNuevoRol, nombre: e.target.value })} />
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.crear_orden} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, crear_orden: e.target.checked } })} /> Crear Órdenes</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.editar_diagnostico} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, editar_diagnostico: e.target.checked } })} /> Modificar Diagnóstico</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.ver_clientes} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, ver_clientes: e.target.checked } })} /> Ver Clientes</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.facturar} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, facturar: e.target.checked } })} /> Remisiones, Ventas y Compras</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.ver_configuracion} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, ver_configuracion: e.target.checked } })} /> Configuración</label>
                </div>
                <button onClick={async () => { if (!formNuevoRol.nombre) return alert('Ingresa un nombre para el rol.'); await agregarRol(formNuevoRol.nombre, formNuevoRol.permisos); alert('Rol creado con éxito'); setFormNuevoRol({ nombre: '', permisos: { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, ver_configuracion: true } }); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">Guardar Nuevo Rol</button>

                <p className="font-bold text-indigo-400 uppercase pt-4 border-t border-slate-700">Crear Usuario y Asignar Rol</p>
                <div className="grid grid-cols-2 gap-2"><input placeholder="Nombre Completo" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formUsuarioNuevo.nombre} onChange={e => setFormUsuarioNuevo({ ...formUsuarioNuevo, nombre: e.target.value })} /><input placeholder="Usuario" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formUsuarioNuevo.usuario} onChange={e => setFormUsuarioNuevo({ ...formUsuarioNuevo, usuario: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2"><input type="password" placeholder="Contraseña" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formUsuarioNuevo.clave} onChange={e => setFormUsuarioNuevo({ ...formUsuarioNuevo, clave: e.target.value })} /><select className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formUsuarioNuevo.rolId} onChange={e => setFormUsuarioNuevo({ ...formUsuarioNuevo, rolId: e.target.value })}><option value="">Selecciona Rol...</option>{roles.map(r => (<option key={r.id} value={r.id}>{r.nombre}</option>))}</select></div>
                <button onClick={async () => { if (!formUsuarioNuevo.nombre || !formUsuarioNuevo.rolId) return alert('Falta el Rol o Nombre'); await agregarUsuario(formUsuarioNuevo); alert('Usuario creado en Supabase'); }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold">Guardar Usuario</button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* MODALES */}
      
      {modalEditOrden && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg p-6 rounded-2xl space-y-3 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-white text-base">Modificar Orden #{modalEditOrden.id}</h3>
            
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 max-h-36 overflow-y-auto space-y-1 text-xs">
              <p className="font-bold text-indigo-400">Historial de Avances Anteriores:</p>
              {(Array.isArray(modalEditOrden.observaciones) ? modalEditOrden.observaciones : []).length > 0 ? (
                modalEditOrden.observaciones.map((obs, idx) => (
                  <p key={idx} className="text-slate-300">▪️ <span className="text-slate-500">[{obs.fecha}]</span> {obs.texto}</p>
                ))
              ) : (
                <p className="text-slate-500">Sin comentarios previos.</p>
              )}
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Estado del Equipo</label>
              <select className="w-full bg-slate-800 p-2 rounded-xl text-xs text-white" value={editOrdForm.estado} onChange={e => setEditOrdForm({ ...editOrdForm, estado: e.target.value })}>
                <option value="Ingresado">Ingresado</option>
                <option value="En Diagnóstico">En Diagnóstico</option>
                <option value="Esperando Repuesto">Esperando Repuesto</option>
                <option value="Reparado / Listo">Reparado / Listo</option>
                <option value="Entregado / Remisionado">Entregado / Remisionado</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] text-slate-400 block mb-1">Diagnóstico Técnico</label>
              <textarea className="w-full bg-slate-800 p-2 rounded-xl text-xs text-white" rows={2} value={editOrdForm.diagnostico} onChange={e => setEditOrdForm({ ...editOrdForm, diagnostico: e.target.value })} placeholder="Diagnóstico técnico..." />
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700">
              <label className="text-xs font-bold text-amber-400 block mb-1">🛒 Asociar o Cambiar Repuesto de Compras</label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white"
                value={editOrdForm.repuestoCompraId}
                onChange={e => setEditOrdForm({ ...editOrdForm, repuestoCompraId: e.target.value })}
              >
                <option value="">-- Ninguno --</option>
                {compras.map(c => (
                  <option key={c.id} value={c.id}>{c.descripcion_producto} (Proveedor: {c.proveedor} - Venta: ${c.precio_venta_sugerido})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-indigo-400 font-bold block mb-1">+ Añadir Nuevo Comentario / Avance</label>
              <input className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={editOrdForm.observacion} onChange={e => setEditOrdForm({ ...editOrdForm, observacion: e.target.value })} placeholder="Ej. Se reparó conector de carga..." />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Presupuesto Estimado ($)</label>
                <input type="number" className="w-full bg-slate-800 p-2 rounded-xl text-xs text-white" value={editOrdForm.presupuesto} onChange={e => setEditOrdForm({ ...editOrdForm, presupuesto: e.target.value })} />
              </div>
              <div>
                <label className="text-[11px] text-emerald-400 font-bold block mb-1">Total a Pagar ($)</label>
                <input type="number" className="w-full bg-slate-800 p-2 rounded-xl text-xs text-white font-bold text-emerald-300" value={editOrdForm.totalPagar} onChange={e => setEditOrdForm({ ...editOrdForm, totalPagar: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalEditOrden(null)} className="text-xs text-slate-400 px-3">Cancelar</button>
              <button onClick={async () => { 
                await actualizarOrden(modalEditOrden.id, editOrdForm.estado, editOrdForm.observacion, editOrdForm.diagnostico, editOrdForm.presupuesto, editOrdForm.totalPagar, editOrdForm.repuestoCompraId); 
                setModalEditOrden(null); 
              }} className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Guardar Cambios</button>
            </div>
          </div>
        </div>
      )}

      {modalEditCliente && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl space-y-3">
            <h3 className="font-bold text-white text-base">{modalEditCliente.id ? 'Modificar Cliente' : 'Nuevo Cliente'}</h3>
            <input placeholder="Nombre *" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.nombre} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, nombre: e.target.value })} />
            <input placeholder="Teléfono *" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.telefono} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono: e.target.value })} />
            <input placeholder="Cédula" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.cedula} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, cedula: e.target.value })} />
            <input placeholder="Correo Electrónico" type="email" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.email} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, email: e.target.value })} />
            <input placeholder="Dirección" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.direccion} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, direccion: e.target.value })} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalEditCliente(null)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={async () => {
                if (!formNuevoCliente.nombre || !formNuevoCliente.telefono) return alert('Nombre y teléfono son obligatorios.');
                if (modalEditCliente.id) {
                  await modificarCliente(modalEditCliente.id, formNuevoCliente);
                } else {
                  await agregarCliente(formNuevoCliente);
                }
                setModalEditCliente(null);
              }} className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {verHistorialCliente && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg p-6 rounded-2xl space-y-3">
            <h3 className="font-bold text-white text-base">Historial de: <span className="text-indigo-400">{verHistorialCliente.nombre}</span></h3>
            <div className="space-y-2 text-xs max-h-60 overflow-y-auto">
              <p className="font-bold text-slate-400 uppercase">Órdenes Registradas:</p>
              {ordenes.filter(o => o.cliente_nombre === verHistorialCliente.nombre).length > 0 ? (
                ordenes.filter(o => o.cliente_nombre === verHistorialCliente.nombre).map(o => (
                  <div key={o.id} className="p-2.5 bg-slate-800 rounded-xl border border-slate-700 space-y-1">
                    <p className="font-bold text-white">Código: {o.codigo_seguimiento} | Estado: <span className="text-amber-400">{o.estado}</span></p>
                    <p className="text-slate-300">Equipo: {o.tipo_equipo} {o.marca_modelo} (S/N: {o.serie || 'N/A'})</p>
                    <p className="text-slate-400">Accesorios: {o.deja_cargador ? '🔌 Cargador ' : ''} {o.deja_bateria ? `🔋 Batería (${o.serie_bateria || 'S/N'})` : ''}</p>
                    <p className="text-slate-400">Fallo: {o.fallo_reportado || o.falla_reportado}</p>
                    <p className="text-slate-400">Diagnóstico: {o.diagnostico || 'En proceso'}</p>
                  </div>
                ))
              ) : (
                <p className="text-slate-500">Este cliente no tiene órdenes registradas aún.</p>
              )}
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setVerHistorialCliente(null)} className="bg-slate-800 text-white px-4 py-1.5 rounded-xl text-xs">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {modalVenta && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg p-6 rounded-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-white text-base">Emitir Venta / Remisión Directa</h3>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-indigo-400 uppercase">Cliente</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setTipoClienteVentaOpt('EXISTENTE'); setClienteVentaSeleccionado(null); }} className={`p-2 rounded-xl text-xs font-bold border transition ${tipoClienteVentaOpt === 'EXISTENTE' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>Buscar Existente</button>
                <button type="button" onClick={() => { setTipoClienteVentaOpt('NUEVO'); setClienteVentaSeleccionado(null); }} className={`p-2 rounded-xl text-xs font-bold border transition ${tipoClienteVentaOpt === 'NUEVO' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>+ Cliente Nuevo</button>
              </div>

              {tipoClienteVentaOpt === 'EXISTENTE' && (
                <div className="relative pt-1">
                  {!clienteVentaSeleccionado ? (
                    <div className="relative">
                      <input type="text" placeholder="Buscar cliente por Nombre o Celular..." className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={busquedaClienteVenta} onChange={e => setBusquedaClienteVenta(e.target.value)} />
                      {busquedaClienteVenta.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20 max-h-36 overflow-y-auto">
                          {clientesFiltradosVenta.length > 0 ? clientesFiltradosVenta.map(c => (
                            <div key={c.id} onClick={() => { setClienteVentaSeleccionado(c); setBusquedaClienteVenta(''); }} className="p-2.5 hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-700/50">
                              <p className="font-bold text-white">{c.nombre}</p><p className="text-[11px] text-indigo-400">Tel: {c.telefono}</p>
                            </div>
                          )) : <p className="p-3 text-xs text-slate-500">No se encontraron coincidencias.</p>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-indigo-950/60 border border-indigo-700/60 p-2.5 rounded-xl flex justify-between items-center text-xs">
                      <div><p className="font-bold text-white">{clienteVentaSeleccionado.nombre}</p><p className="text-indigo-300">Tel: {clienteVentaSeleccionado.telefono}</p></div>
                      <button onClick={() => setClienteVentaSeleccionado(null)} className="text-slate-400 hover:text-white font-bold text-xs">Cambiar</button>
                    </div>
                  )}
                </div>
              )}

              {tipoClienteVentaOpt === 'NUEVO' && (
                <div className="space-y-2 pt-1 bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-xs">
                  <input placeholder="Nombre Completo *" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.nombre} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, nombre: e.target.value })} />
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Teléfono / WhatsApp *" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.telefono} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, telefono: e.target.value })} />
                    <input placeholder="Cédula" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.cedula} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, cedula: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Correo Electrónico" type="email" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.email} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, email: e.target.value })} />
                    <input placeholder="Dirección" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.direccion} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, direccion: e.target.value })} />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 bg-slate-800/50 p-3 rounded-xl border border-slate-800">
              <label className="text-xs font-bold text-amber-400 block">🛒 Seleccionar Producto Registrado en Compras (Opcional)</label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" 
                value={compraSeleccionadaVentaId} 
                onChange={e => {
                  const idSel = e.target.value;
                  setCompraSeleccionadaVentaId(idSel);
                  if(idSel) {
                    const compObj = compras.find(c => c.id.toString() === idSel);
                    if(compObj) {
                      const nuevosItems = [...itemsVenta];
                      nuevosItems[0].descripcion = `[Repuesto Comprado]: ${compObj.descripcion_producto}`;
                      nuevosItems[0].precio = compObj.precio_venta_sugerido || 0;
                      setItemsVenta(nuevosItems);
                    }
                  }
                }}
              >
                <option value="">-- Ninguno (Venta Manual) --</option>
                {compras.map(c => (
                  <option key={c.id} value={c.id}>{c.descripcion_producto} (Costo: ${c.costo} / Venta: ${c.precio_venta_sugerido})</option>
                ))}
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-slate-400 uppercase">Artículos / Ítems en Factura</label>
              {itemsVenta.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <input placeholder="Descripción repuesto..." className="flex-1 bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={it.descripcion} onChange={e => { const n = [...itemsVenta]; n[idx].descripcion = e.target.value; setItemsVenta(n); }} />
                  <input type="number" placeholder="Cant." className="w-16 bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white text-center" value={it.cantidad} onChange={e => { const n = [...itemsVenta]; n[idx].cantidad = Number(e.target.value); setItemsVenta(n); }} />
                  <input type="number" placeholder="Precio ($)" className="w-28 bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={it.precio} onChange={e => { const n = [...itemsVenta]; n[idx].precio = Number(e.target.value); setItemsVenta(n); }} />
                </div>
              ))}
              <button type="button" onClick={() => setItemsVenta([...itemsVenta, { descripcion: '', cantidad: 1, precio: 0 }])} className="text-xs text-indigo-400 font-bold hover:underline">+ Añadir otro ítem</button>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="font-bold text-xs text-white">Total a Pagar Cliente:</span>
              <span className="font-extrabold text-emerald-400 text-base">$ {itemsVenta.reduce((acc, i) => acc + (i.cantidad * i.precio), 0).toLocaleString('es-CO')}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalVenta(false)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={async () => {
                let clienteFinalObj = null;
                if (tipoClienteVentaOpt === 'EXISTENTE' && clienteVentaSeleccionado) {
                  clienteFinalObj = clienteVentaSeleccionado;
                } else if (tipoClienteVentaOpt === 'NUEVO') {
                  if (!formNuevoClienteVenta.nombre || !formNuevoClienteVenta.telefono) return alert('Ingresa el nombre y teléfono del cliente.');
                  clienteFinalObj = await agregarCliente(formNuevoClienteVenta);
                }

                const total = itemsVenta.reduce((acc, i) => acc + (i.cantidad * i.precio), 0);
                if (total <= 0) return alert('Ingresa ítems con precio mayor a 0');

                let costoCompraTotal = 0;
                if (compraSeleccionadaVentaId) {
                  const compAsociada = compras.find(c => c.id.toString() === compraSeleccionadaVentaId);
                  if (compAsociada) costoCompraTotal = Number(compAsociada.costo) || 0;
                }
                
                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                const fac = await agregarVentaDirecta(clienteFinalObj, itemsVenta, total, costoCompraTotal, nombreUsrActual);
                setModalVenta(false);
                if(fac) {
                  alert('¡Remisión creada con éxito!');
                  setDocumentoImprimir({ tipo: 'FACTURA', data: fac });
                }
              }} className="bg-emerald-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Generar Remisión</button>
            </div>
          </div>
        </div>
      )}

      {modalRemisionarOrden && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl space-y-4">
            <h3 className="font-bold text-white text-base">Remisionar Orden</h3>
            <p className="text-xs text-slate-400">Cliente: <strong className="text-white">{modalRemisionarOrden.orden.cliente_nombre}</strong></p>
            
            <div className="space-y-2 pt-2">
              <label className="text-xs font-bold text-amber-400 block">🛒 ¿Incluir algún repuesto/producto de Compras?</label>
              <select 
                className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white"
                value={modalRemisionarOrden.compraId}
                onChange={e => setModalRemisionarOrden({ ...modalRemisionarOrden, compraId: e.target.value })}
              >
                <option value="">-- No incluir producto de compras --</option>
                {compras.map(c => (
                  <option key={c.id} value={c.id}>{c.descripcion_producto} (Venta sugerida: ${c.precio_venta_sugerido})</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">Nota: El producto seleccionado se sumará al total de la remisión del cliente y su costo se restará en informes internos para calcular tu utilidad real.</p>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setModalRemisionarOrden(null)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={async () => {
                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                let itemCompraObj = null;
                if (modalRemisionarOrden.compraId) {
                  itemCompraObj = compras.find(c => c.id.toString() === modalRemisionarOrden.compraId.toString());
                }

                const fac = await remisionarOrden(modalRemisionarOrden.orden, nombreUsrActual, itemCompraObj);
                setModalRemisionarOrden(null);
                if(fac){
                  alert('¡Remisión Generada Correctamente!');
                  setDocumentoImprimir({ tipo: 'FACTURA', data: fac });
                }
              }} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold">Confirmar y Generar Remisión</button>
            </div>
          </div>
        </div>
      )}

      {modalCompra && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl space-y-4">
            <h3 className="font-bold text-white text-base">Registrar Nueva Compra / Gasto</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Proveedor / Tienda</label>
                <input placeholder="Ej. DistriPartes S.A.S" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formCompra.proveedor} onChange={e => setFormCompra({...formCompra, proveedor: e.target.value})} />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Descripción del Producto / Repuesto</label>
                <input placeholder="Ej. Pantalla Portátil Lenovo 15.6" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={formCompra.descripcion_producto} onChange={e => setFormCompra({...formCompra, descripcion_producto: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 block mb-1">Costo Invertido ($)</label>
                  <input type="number" placeholder="0" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white font-bold text-rose-400" value={formCompra.costo} onChange={e => setFormCompra({...formCompra, costo: e.target.value})} />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Precio Venta Sugerido ($)</label>
                  <input type="number" placeholder="0" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white font-bold text-emerald-400" value={formCompra.precio_venta_sugerido} onChange={e => setFormCompra({...formCompra, precio_venta_sugerido: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setModalCompra(false)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={async () => {
                if(!formCompra.proveedor || !formCompra.descripcion_producto || Number(formCompra.costo) <= 0) {
                  return alert('Por favor completa el proveedor, producto y un costo válido.');
                }
                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                const res = await agregarCompra(formCompra, nombreUsrActual);
                if(res) {
                  alert('¡Compra registrada correctamente!');
                  setModalCompra(false);
                }
              }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition">Guardar Compra</button>
            </div>
          </div>
        </div>
      )}

      {modalReporteExcel && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl space-y-4">
            <h3 className="font-bold text-white text-base">Descargar Reporte Financiero en Excel (CSV)</h3>
            
            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Fecha de Inicio</label>
                <input type="date" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={reporteFiltro.fechaInicio} onChange={e => setReporteFiltro({...reporteFiltro, fechaInicio: e.target.value})} />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Fecha Fin</label>
                <input type="date" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={reporteFiltro.fechaFin} onChange={e => setReporteFiltro({...reporteFiltro, fechaFin: e.target.value})} />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">Tipo de Registro</label>
                <select className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white" value={reporteFiltro.tipo} onChange={e => setReporteFiltro({...reporteFiltro, tipo: e.target.value})}>
                  <option value="AMBOS">Ambos (Ventas y Reparaciones)</option>
                  <option value="VENTAS">Solo Ventas de Repuestos</option>
                  <option value="REPARACIONES">Solo Reparaciones (Servicio Técnico)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setModalReporteExcel(false)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={generarReporteExcel} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition">Descargar Excel</button>
            </div>
          </div>
        </div>
      )}

      {facturaSeleccionada && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-base">Detalle de {facturaSeleccionada.numero_factura}</h3>
              <span className="text-xs font-bold text-indigo-400">Fecha: {facturaSeleccionada.fecha}</span>
            </div>
            <p className="text-xs text-slate-300"><strong>Cliente:</strong> {facturaSeleccionada.cliente_nombre}</p>
            <p className="text-xs text-slate-300"><strong>Teléfono:</strong> {facturaSeleccionada.cliente_telefono || 'N/A'}</p>
            <p className="text-xs text-slate-300"><strong>Vendedor:</strong> <span className="text-indigo-300 font-semibold">{facturaSeleccionada.usuario_creador || 'Sistema'}</span></p>
            <p className="text-xs text-slate-300"><strong>Tipo Operación:</strong> {facturaSeleccionada.tipo}</p>

            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400">
                  <tr><th className="p-2">Ítem / Descripción</th><th className="p-2 text-center">Cant.</th><th className="p-2 text-right">Precio</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(facturaSeleccionada.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td className="p-2 text-[11px]">{it.descripcion}</td>
                      <td className="p-2 text-center text-[11px]">{it.cantidad}</td>
                      <td className="p-2 text-right text-[11px]">$ {(it.precio || 0).toLocaleString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              <span className="font-bold text-xs text-white">Total Venta Cliente:</span>
              <span className="font-extrabold text-emerald-400 text-base">$ {(facturaSeleccionada.total || 0).toLocaleString('es-CO')}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setFacturaSeleccionada(null)} className="bg-slate-800 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {documentoImprimir && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 w-full max-w-xl p-5 rounded-2xl space-y-2 shadow-2xl h-[50vh] max-h-[50vh] overflow-y-auto flex flex-col justify-between border-b-2 border-dashed border-slate-400">
            <div id="seccion-impresion" className="space-y-2 text-[17px]">
              
              <div className="flex items-center justify-between border-b pb-1 gap-2">
                <div className="flex items-center gap-2">
                  {empresa.logoUrl && (
                    <img src={empresa.logoUrl} alt="Logo" className="w-14 h-14 object-contain rounded-lg border p-0.5 bg-white shrink-0" />
                  )}
                  <div>
                    <h1 className="font-black text-2xl leading-tight">{empresa.nombre}</h1>
                    <p className="text-sm text-slate-600">Tel: {empresa.telefono || 'N/A'} | Email: {empresa.email || 'N/A'}</p>
                  </div>
                </div>
                <h2 className="font-extrabold text-indigo-700 uppercase text-right text-xl shrink-0">
                  {documentoImprimir.tipo === 'FACTURA' ? 'REMISIÓN' : 'ORDEN DE ENTRADA'}
                </h2>
              </div>

              {documentoImprimir.tipo === 'ORDEN' && (
                <div className="space-y-1.5 text-base">
                  {documentoImprimir.idConsecutivo && (
                    <p className="text-lg"><strong>N° Registro:</strong> <span className="font-black text-indigo-700">{documentoImprimir.idConsecutivo}</span></p>
                  )}
                  <div className="grid grid-cols-2 gap-1">
                    <p><strong>Cliente:</strong> {documentoImprimir.data.cliente_nombre}</p>
                    <p><strong>Teléfono:</strong> {documentoImprimir.data.cliente_telefono || 'N/A'}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <p><strong>Código Seguimiento:</strong> {documentoImprimir.data.codigo_seguimiento}</p>
                    <p><strong>Atendió:</strong> {documentoImprimir.data.usuario_creador || 'Sistema'}</p>
                  </div>
                  <p><strong>Equipo:</strong> {documentoImprimir.data.tipo_equipo} {documentoImprimir.data.marca_modelo} (S/N: {documentoImprimir.data.serie || 'N/A'})</p>
                  <p><strong>Accesorios:</strong> {documentoImprimir.data.deja_cargador ? '🔌 Cargador ' : ''} {documentoImprimir.data.deja_bateria ? `🔋 Batería (${documentoImprimir.data.serie_bateria || 'S/N'})` : ''} {!documentoImprimir.data.deja_cargador && !documentoImprimir.data.deja_bateria ? 'Ninguno' : ''}</p>
                  <p><strong>Fallo Reportado:</strong> {documentoImprimir.data.fallo_reportado || documentoImprimir.data.falla_reportado}</p>
                  <p><strong>Diagnóstico Actual:</strong> {documentoImprimir.data.diagnostico || 'En proceso'}</p>
                  
                  <div className="flex gap-4">
                    {Number(documentoImprimir.data.valor_estimado) > 0 && (
                      <p><strong>Presupuesto Est.:</strong> $ {Number(documentoImprimir.data.valor_estimado).toLocaleString('es-CO')}</p>
                    )}
                    {Number(documentoImprimir.data.total_pagar) > 0 && (
                      <p className="font-bold text-emerald-700 text-lg"><strong>Total a Pagar:</strong> $ {Number(documentoImprimir.data.total_pagar).toLocaleString('es-CO')}</p>
                    )}
                  </div>
                </div>
              )}

              {documentoImprimir.tipo === 'FACTURA' && (
                <div className="space-y-1.5 text-base">
                  <div className="flex justify-between text-lg">
                    <p><strong>Remisión N°:</strong> <span className="font-black text-indigo-700">{documentoImprimir.data.numero_factura}</span></p>
                    <p><strong>Fecha:</strong> {documentoImprimir.data.fecha}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <p><strong>Cliente:</strong> {documentoImprimir.data.cliente_nombre}</p>
                    <p><strong>Vendedor:</strong> {documentoImprimir.data.usuario_creador || 'Sistema'}</p>
                  </div>

                  <table className="w-full text-left border border-slate-300 mt-1 text-base">
                    <thead className="bg-slate-100">
                      <tr><th className="p-1.5 border">Descripción</th><th className="p-1.5 text-center border">Cant.</th><th className="p-1.5 text-right border">Precio</th></tr>
                    </thead>
                    <tbody>
                      {(documentoImprimir.data.items || []).map((it, idx) => (
                        <tr key={idx}><td className="p-1.5 border">{it.descripcion}</td><td className="p-1.5 text-center border">{it.cantidad}</td><td className="p-1.5 text-right border">$ {(it.precio || 0).toLocaleString('es-CO')}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="font-black text-emerald-700 text-xl text-right mt-1">Total a Pagar: $ {(documentoImprimir.data.total || 0).toLocaleString('es-CO')}</p>

                  <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300 grid grid-cols-2 gap-3 text-sm">
                    <div className="border border-slate-300 p-2 rounded h-14 flex flex-col justify-between">
                      <span className="font-bold text-slate-600 uppercase text-xs">Garantía:</span>
                      <div className="border-b border-dotted border-slate-400 w-full mb-1"></div>
                      <div className="border-b border-dotted border-slate-400 w-full"></div>
                    </div>
                    <div className="border border-slate-300 p-2 rounded h-14 flex flex-col items-center justify-end text-center">
                      <span className="text-xs text-slate-400 font-bold uppercase">Sello / Firma</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t no-imprimir">
              <button onClick={() => setDocumentoImprimir(null)} className="text-slate-500 px-3 text-xs">Cerrar</button>
              <button 
                onClick={() => {
                  const doc = documentoImprimir.data;
                  const tel = doc.cliente_telefono || '3000000000';
                  const nombreClienteLimpio = (doc.cliente_nombre || 'Cliente').replace(/[^a-zA-Z0-9]/g, '_');
                  const telefonoLimpio = (doc.cliente_telefono || '0000000000').replace(/[^a-zA-Z0-9]/g, '');
                  
                  // Nombre del archivo estructurado con número, cliente y celular
                  const elHtml = document.getElementById('seccion-impresion').innerHTML;
                  const blob = new Blob([`<html><head><title>Comprobante</title><style>body{font-family:sans-serif;padding:20px;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:8px;}</style></head><body>${elHtml}</body></html>`], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  
                  const nombreArchivo = documentoImprimir.tipo === 'FACTURA' 
                    ? `Remision_${doc.numero_factura}_${nombreClienteLimpio}_${telefonoLimpio}.html` 
                    : `Orden_${documentoImprimir.idConsecutivo || doc.codigo_seguimiento}_${nombreClienteLimpio}_${telefonoLimpio}.html`;
                  
                  a.download = nombreArchivo;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);

                  let msg = '';
                  if (documentoImprimir.tipo === 'FACTURA') {
                    msg = `Hola *${doc.cliente_nombre}* 👋\n\nTe enviamos los detalles de tu Remisión *${doc.numero_factura}* en *${empresa.nombre}*.`;
                  } else {
                    msg = `Hola *${doc.cliente_nombre}* 👋\n\nTe enviamos los detalles de tu Orden de Entrada *${documentoImprimir.idConsecutivo || 'N/A'}* en *${empresa.nombre}*.`;
                  }
                  window.open(`https://wa.me/57${tel}?text=${encodeURIComponent(msg)}`, '_blank');
                }} 
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1"
                title="Descarga el documento con nombre personalizado y abre WhatsApp"
              >
                💬 Enviar por WhatsApp
              </button>
              <button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-xs transition">Imprimir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PortalPublico() {
  const { empresa, ordenes } = useApp();
  const [codigoConsulta, setCodigoConsulta] = useState('');
  const [ordenConsultaResult, setOrdenConsultaResult] = useState(null);
  const [mostrarHistorialPortal, setMostrarHistorialPortal] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans">
      <div className="max-w-xl w-full mx-auto bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl text-center space-y-4">
        {empresa.logoUrl ? (
          <img src={empresa.logoUrl} alt="Logo" className="w-32 h-32 object-contain mx-auto rounded-xl bg-slate-800 p-2 border border-slate-700 shadow-lg" />
        ) : (
          <div className="w-24 h-24 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-3xl mx-auto shadow-lg shadow-indigo-600/30">TF</div>
        )}
        <h2 className="text-xl font-bold text-white mb-0">{empresa.nombre}</h2>
        <p className="text-xs text-slate-400">Portal Público de Consulta</p>
        
        <div className="flex gap-2">
          <input 
            placeholder="Ingresa tu Código (ej. TK-89A1)" 
            className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded-xl text-sm font-bold font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white" 
            value={codigoConsulta} 
            onChange={e => setCodigoConsulta(e.target.value.toUpperCase())} 
          />
          <button 
            onClick={() => { 
              const res = ordenes.find(o => o.codigo_seguimiento && o.codigo_seguimiento.toUpperCase() === codigoConsulta.trim().toUpperCase()); 
              setOrdenConsultaResult(res || 'NO_ENCONTRADO'); 
              setMostrarHistorialPortal(false);
            }} 
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl font-bold text-xs transition"
          >
            Consultar
          </button>
        </div>

        {ordenConsultaResult && ordenConsultaResult !== 'NO_ENCONTRADO' && (
          <div className="text-left bg-slate-800/60 p-5 rounded-xl border border-slate-700 space-y-3 text-xs">
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <span className="font-bold text-indigo-400 text-sm">Estado: {ordenConsultaResult.estado}</span>
              <span className="font-mono text-[11px] text-amber-400">Código: {ordenConsultaResult.codigo_seguimiento}</span>
            </div>
            <p className="text-white"><strong>Equipo:</strong> {ordenConsultaResult.tipo_equipo} {ordenConsultaResult.marca_modelo}</p>
            <p className="text-slate-300"><strong>Accesorios:</strong> {ordenConsultaResult.deja_cargador ? '🔌 Cargador ' : ''} {ordenConsultaResult.deja_bateria ? `🔋 Batería (${ordenConsultaResult.serie_bateria || 'S/N'})` : ''} {!ordenConsultaResult.deja_cargador && !ordenConsultaResult.deja_bateria ? 'Ninguno' : ''}</p>
            <p className="text-white"><strong>Fallo Reportado:</strong> {ordenConsultaResult.fallo_reportado || ordenConsultaResult.falla_reportado}</p>
            <p className="text-white"><strong>Diagnóstico Técnico:</strong> {ordenConsultaResult.diagnostico || 'Equipo en proceso de revisión.'}</p>
            
            {ordenConsultaResult.numero_factura_asociada && (
              <p className="text-white"><strong>Remisión Asociada:</strong> <span className="text-indigo-400 font-mono font-bold">{ordenConsultaResult.numero_factura_asociada}</span></p>
            )}

            {Number(ordenConsultaResult.valor_estimado) > 0 && (
              <p className="text-white"><strong>Presupuesto Estimado:</strong> $ {Number(ordenConsultaResult.valor_estimado).toLocaleString('es-CO')}</p>
            )}

            {Number(ordenConsultaResult.total_pagar) > 0 && (
              <p className="bg-emerald-950/40 border border-emerald-800/50 p-2.5 rounded-xl"><strong className="text-emerald-400">Total a Pagar:</strong> <span className="text-emerald-300 font-extrabold">$ {Number(ordenConsultaResult.total_pagar).toLocaleString('es-CO')}</span></p>
            )}

            <div className="pt-2 border-t border-slate-700">
              <button 
                onClick={() => setMostrarHistorialPortal(!mostrarHistorialPortal)} 
                className="w-full flex justify-between items-center text-xs font-bold text-indigo-400 bg-slate-800 p-2.5 rounded-xl border border-slate-700 transition hover:bg-slate-700/80"
              >
                <span>📜 Ver historial de avances y procesos</span>
                <span>{mostrarHistorialPortal ? '▲' : '▼'}</span>
              </button>

              {mostrarHistorialPortal && (
                <div className="mt-2 space-y-1.5 p-3 bg-slate-900/90 rounded-xl border border-slate-800">
                  {(Array.isArray(ordenConsultaResult.observaciones) ? ordenConsultaResult.observaciones : []).length > 0 ? (
                    ordenConsultaResult.observaciones.map((obs, idx) => (
                      <p key={idx} className="text-[11px] text-slate-300">🔹 <span className="text-slate-500 font-mono">[{obs.fecha}]</span> {obs.texto}</p>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-500">Sin registros en el historial aún.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {ordenConsultaResult === 'NO_ENCONTRADO' && (
          <p className="text-xs text-amber-400 py-2">No se encontró ninguna orden con ese código.</p>
        )}

        <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-400 space-y-1">
          <p className="font-bold text-slate-300">{empresa.nombre}</p>
          {empresa.direccion && <p>📍 Dirección: {empresa.direccion}</p>}
          {empresa.telefono && <p>📞 Teléfono: {empresa.telefono}</p>}
          {empresa.email && <p>✉️ Correo: {empresa.email}</p>}
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { usuarioSesion } = useApp();
  if (window.location.pathname === '/portal') return <PortalPublico />;
  return usuarioSesion ? <MainApp /> : <LoginScreen />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}