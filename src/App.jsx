import React, { useState, useEffect, createContext, useContext } from 'react';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { supabase } from './lib/supabase';


// ==========================================
// FONDO ANIMADO INTERACTIVO (CANVAS 2D)
// ==========================================
function InteractiveBackground() {
  const canvasRef = React.useRef(null);

  useEffect(() => {
    // Desactivar la animación en dispositivos táctiles para ahorrar batería.
    if ("ontouchstart" in window) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId;
    let particles = [];
    let width = window.innerWidth;
    let height = window.innerHeight;

    const MAX_PARTICLES = 70;
    const CONNECTION_DISTANCE = 130;
    const MOUSE_RADIUS = 160;

    const mouse = { x: null, y: null };

    canvas.width = width;
    canvas.height = height;

    const createParticles = () => {
      const count = Math.min(
        MAX_PARTICLES,
        Math.max(18, Math.floor((width * height) / 18000))
      );

      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 1.8 + 1,
      }));
    };

    const resizeCanvas = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      createParticles();
    };

    const handleMouseMove = (event) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    };

    const handleMouseOut = (event) => {
      // Solo se reinicia al salir de la ventana, no al pasar entre elementos.
      if (!event.relatedTarget) {
        mouse.x = null;
        mouse.y = null;
      }
    };

    const drawParticles = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, width, height);

      for (const particle of particles) {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > height) particle.vy *= -1;

        if (mouse.x !== null && mouse.y !== null) {
          const dx = particle.x - mouse.x;
          const dy = particle.y - mouse.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < MOUSE_RADIUS && distance > 0) {
            const force = (MOUSE_RADIUS - distance) / MOUSE_RADIUS;
            particle.x += (dx / distance) * force * 1.8;
            particle.y += (dy / distance) * force * 1.8;
          }
        }

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = "#6366f1";
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < CONNECTION_DISTANCE) {
            const opacity = 1 - distance / CONNECTION_DISTANCE;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99, 102, 241, ${opacity * 0.35})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(drawParticles);
    };

    createParticles();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseout", handleMouseOut);
    drawParticles();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseout", handleMouseOut);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -1,
        pointerEvents: "none",
        backgroundColor: "#0f172a",
      }}
    />
  );
}

// La carpeta elegida se guarda localmente en este navegador (no en Supabase).
const PDF_FOLDER_DB = 'pc-doctor-cali-local';
const PDF_FOLDER_STORE = 'preferencias';
const PDF_FOLDER_KEY = 'carpeta-remisiones';

function abrirDBCarpetaPDF() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PDF_FOLDER_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PDF_FOLDER_STORE)) request.result.createObjectStore(PDF_FOLDER_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function guardarHandleCarpetaPDF(handle) {
  const db = await abrirDBCarpetaPDF();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_FOLDER_STORE, 'readwrite');
    tx.objectStore(PDF_FOLDER_STORE).put(handle, PDF_FOLDER_KEY);
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function leerHandleCarpetaPDF() {
  const db = await abrirDBCarpetaPDF();
  const handle = await new Promise((resolve, reject) => {
    const request = db.transaction(PDF_FOLDER_STORE, 'readonly').objectStore(PDF_FOLDER_STORE).get(PDF_FOLDER_KEY);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
  db.close();
  return handle;
}

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
  const [cotizaciones, setCotizaciones] = useState([]);
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

      const resCot = await supabase.from('cotizaciones').select('*').order('id', { ascending: false });
      if (resCot.data) setCotizaciones(resCot.data);

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
    const datosCliente = { ...data, telefono_secundario: String(data.telefono_secundario || '').trim() || null };
    const { data: insertado, error } = await supabase.from('clientes').insert([datosCliente]).select();
    if (error || !insertado) {
      alert('Error guardando cliente.');
      return null;
    }
    setClientes(prev => [insertado[0], ...prev]);
    return insertado[0];
  };

  const modificarCliente = async (id, data) => {
    const datosCliente = { ...data, telefono_secundario: String(data.telefono_secundario || '').trim() || null };
    const { error } = await supabase.from('clientes').update(datosCliente).eq('id', id);
    if (!error) {
      setClientes(prev => prev.map(c => c.id === id ? { ...c, ...datosCliente } : c));
      return true;
    } else {
      console.error('Error actualizando cliente:', error);
      alert(`Error actualizando cliente: ${error.message || 'Error desconocido'}`);
      return false;
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
      serie_cargador: ordenData.serie_cargador || '',
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

  const actualizarOrden = async (id, estado, obs, diag, presupuesto, totalPagar, repuestoCompraId = null, remisionAsociada = null, garantiaAplica = undefined, garantiaTiempo = undefined, datosEdicion = null) => {
    const ordenObj = ordenes.find(o => o.id === id);
    if (!ordenObj) return;

    let obsArr = Array.isArray(ordenObj.observaciones) ? [...ordenObj.observaciones] : [];
    if (obs && obs.trim()) {
      obsArr.push({ fecha: new Date().toLocaleString('es-CO'), texto: obs.trim() });
    }
    // Registro interno de garantía dentro del JSON existente observaciones.
    // Se reemplaza solo este registro, sin borrar el historial de avances.
    if (garantiaAplica !== undefined || garantiaTiempo !== undefined) {
      const garantiaAnterior = obtenerGarantiaOrden(ordenObj);
      obsArr = obsArr.filter(item => !item || item._tipo !== 'garantia');
      const aplicaFinal = garantiaAplica !== undefined ? !!garantiaAplica : garantiaAnterior.aplica;
      const tiempoFinal = garantiaTiempo !== undefined ? String(garantiaTiempo || '') : garantiaAnterior.tiempo;
      obsArr.push({ _tipo: 'garantia', aplica: aplicaFinal, tiempo: aplicaFinal ? tiempoFinal : '' });
    }

    const updateData = {
      estado,
      diagnostico: diag !== undefined ? diag : ordenObj.diagnostico,
      valor_estimado: presupuesto !== undefined ? Number(presupuesto) : ordenObj.valor_estimado,
      total_pagar: totalPagar !== undefined ? Number(totalPagar) : (ordenObj.total_pagar || 0),
      repuesto_compra_id: repuestoCompraId !== undefined ? (repuestoCompraId ? Number(repuestoCompraId) : null) : ordenObj.repuesto_compra_id,
      observaciones: obsArr,
      ...(remisionAsociada ? { numero_factura_asociada: remisionAsociada } : {}),
      ...(datosEdicion && typeof datosEdicion === 'object' ? datosEdicion : {})
    };

    const { error } = await supabase.from('ordenes').update(updateData).eq('id', id);
    if (!error) {
      setOrdenes(prev => prev.map(o => o.id === id ? { ...o, ...updateData } : o));
      return true;
    } else {
      console.error('Error al actualizar la orden en Supabase:', error);
      alert(`Error al actualizar la orden: ${error.message || 'Error desconocido'}`);
      return false;
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

  const actualizarPrecioCompra = async (id, precio) => {
    const precioNumerico = precio === '' || precio === null ? 0 : Number(precio);
    if (!Number.isFinite(precioNumerico) || precioNumerico < 0) {
      alert('Ingresa un precio de venta válido.');
      return false;
    }

    const { error } = await supabase
      .from('compras')
      .update({ precio_venta_sugerido: precioNumerico })
      .eq('id', id);

    if (error) {
      console.error('Error actualizando el precio de venta:', error);
      alert('No se pudo actualizar el precio de venta. Intenta nuevamente.');
      return false;
    }

    setCompras(prev => prev.map(c => c.id === id
      ? { ...c, precio_venta_sugerido: precioNumerico }
      : c
    ));
    return true;
  };

  const remisionarOrden = async (orden, nombreUsuario, itemCompraSeleccionado = null, garantiaAplica = undefined, garantiaTiempo = undefined) => {
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

    const garantiaOrden = obtenerGarantiaOrden(orden);
    const aplicaGarantiaFinal = garantiaAplica !== undefined ? !!garantiaAplica : garantiaOrden.aplica;
    const tiempoGarantiaFinal = garantiaTiempo !== undefined ? String(garantiaTiempo || '') : garantiaOrden.tiempo;
    if (aplicaGarantiaFinal) {
      itemsRemision.push({ _tipo: 'garantia', aplica: true, tiempo: tiempoGarantiaFinal });
    }

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

  const agregarVentaDirecta = async (clienteObj, itemsArray, totalCalculado, costoCompraTotal, nombreUsuario, garantiaAplica = false, garantiaTiempo = '') => {
    const nombreCliente = clienteObj ? clienteObj.nombre : 'Cliente Mostrador';
    const telefonoCliente = clienteObj ? (clienteObj.telefono || 'N/A') : 'N/A';
    
    const consecutivoNum = 10001 + facturas.length;
    const numRemisionGenerado = `REM-${consecutivoNum}`;

    const itemsConGarantia = [...itemsArray];
    if (garantiaAplica) {
      itemsConGarantia.push({ _tipo: 'garantia', aplica: true, tiempo: String(garantiaTiempo || '') });
    }

    const nuevaFac = {
      numero_factura: numRemisionGenerado,
      cliente_nombre: nombreCliente,
      cliente_telefono: telefonoCliente,
      fecha: new Date().toISOString().split('T')[0],
      total: totalCalculado,
      costo_compra: costoCompraTotal || 0,
      tipo: 'Venta de Repuestos',
      usuario_creador: nombreUsuario || 'Sistema',
      items: itemsConGarantia
    };

    const { data: insertada, error } = await supabase.from('facturas').insert([nuevaFac]).select();
    if (!error && insertada) { 
      setFacturas(prev => [insertada[0], ...prev]); 
      return insertada[0]; 
    } else {
      alert('Error al generar la remisión directa.');
    }
  };

  const cancelarRemision = async (factura, motivo, nombreUsuario) => {
    if (!factura?.id) {
      alert('No se encontró el registro de la remisión.');
      return false;
    }
    if (facturaEstaCancelada(factura)) {
      alert('Esta remisión ya está cancelada.');
      return false;
    }
    const motivoFinal = String(motivo || '').trim();
    if (!motivoFinal) {
      alert('Escribe el motivo de la cancelación.');
      return false;
    }

    const registroCancelacion = {
      _tipo: 'cancelacion',
      cancelada: true,
      motivo: motivoFinal,
      usuario: nombreUsuario || 'Usuario',
      fecha: new Date().toISOString(),
      numero_factura: factura.numero_factura || ''
    };
    const itemsActualizados = [
      ...(Array.isArray(factura.items) ? factura.items.filter(item => !item || item._tipo !== 'cancelacion') : []),
      registroCancelacion
    ];

    const { data: actualizado, error } = await supabase
      .from('facturas')
      .update({ items: itemsActualizados })
      .eq('id', factura.id)
      .select()
      .single();

    if (error || !actualizado) {
      console.error('Error cancelando remisión:', error);
      alert(`No se pudo cancelar la remisión. ${error?.message || 'Intenta nuevamente.'}`);
      return false;
    }

    setFacturas(prev => prev.map(item => item.id === factura.id ? actualizado : item));
    return actualizado;
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
      facturas, remisionarOrden, agregarVentaDirecta, cancelarRemision,
      compras, agregarCompra, actualizarPrecioCompra, cotizaciones, setCotizaciones
    }}>
      {children}
    </AppContext.Provider>
  );
}

const useApp = () => useContext(AppContext);

// La garantía se guarda dentro de campos JSON que ya existen en Supabase.
// Así no se agregan ni modifican columnas de la base de datos.
const CONDICIONES_GARANTIA = 'Para efectos de Garantía se necesita copia de la facrura y la mercancia con todos los accesorios y empaques originales, no se dara garantia por daños ocacionados por alto voltaje, golpes, deterioro o desconfiguracion de la maquina, software, virus o por levantar los sellos de seguridad. la garantia es directamente con el centro de servicio o en el almacen. por ninguna excepcion se hace servicio a domicilio.';

const obtenerGarantiaOrden = (orden) => {
  const registro = (Array.isArray(orden?.observaciones) ? orden.observaciones : [])
    .find(item => item && item._tipo === 'garantia');
  return { aplica: !!registro?.aplica, tiempo: registro?.tiempo || '' };
};

const obtenerGarantiaFactura = (factura) => {
  const registro = (Array.isArray(factura?.items) ? factura.items : [])
    .find(item => item && item._tipo === 'garantia');
  return { aplica: !!registro?.aplica, tiempo: registro?.tiempo || '' };
};

const esRegistroGarantia = (item) => !!item && item._tipo === 'garantia';

// La cancelación se conserva dentro del JSON existente de items para no exigir
// nuevas columnas en la tabla facturas.
const obtenerCancelacionFactura = (factura) =>
  (Array.isArray(factura?.items) ? factura.items : []).find(item => item && item._tipo === 'cancelacion') || null;

const facturaEstaCancelada = (factura) => !!obtenerCancelacionFactura(factura);

// Normaliza teléfonos para enlaces de WhatsApp (wa.me).
// Los números colombianos de 10 dígitos reciben el indicativo 57.
// Los números que ya incluyen indicativo internacional se conservan.
const normalizarTelefonoWhatsApp = (telefono) => {
  if (telefono === null || telefono === undefined || String(telefono).trim() === '') {
    return null;
  }

  let numero = String(telefono).trim().replace(/\D/g, '');

  // Convierte el prefijo internacional 00: 0057... -> 57...
  if (numero.startsWith('00')) {
    numero = numero.slice(2);
  }

  // Algunos registros guardan el celular colombiano con un cero inicial.
  if (numero.length === 11 && numero.startsWith('0')) {
    numero = '57' + numero.slice(1);
  } else if (numero.length === 10) {
    // Número celular colombiano local sin indicativo.
    numero = '57' + numero;
  }

  // wa.me requiere un número internacional solo con dígitos (8 a 15 dígitos).
  if (numero.length < 8 || numero.length > 15) {
    return null;
  }

  return numero;
};


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
    <div className="min-h-screen bg-transparent flex items-center justify-center p-4">
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
    empresa, clientes, ordenes, facturas, compras, agregarCompra, actualizarPrecioCompra, roles, agregarRol, actualizarRol, usuarios, agregarUsuario,
    usuarioSesion, logout, rolActual,
    agregarCliente, modificarCliente, agregarOrden, actualizarOrden,
    remisionarOrden, agregarVentaDirecta, cancelarRemision, setEmpresa, cotizaciones, setCotizaciones
  } = useApp();

  const [tab, setTab] = useState('dashboard');
  const [modalEditOrden, setModalEditOrden] = useState(null);
  const [modalEditOrdenModo, setModalEditOrdenModo] = useState('diagnostico'); // 'diagnostico' conserva el flujo habitual; 'editar' corrige datos de ingreso
  const [modalEditCliente, setModalEditCliente] = useState(null);
  const [verHistorialCliente, setVerHistorialCliente] = useState(null);
  const [modalVenta, setModalVenta] = useState(false);
  const [modalCompra, setModalCompra] = useState(false);
  const [modalRemisionarOrden, setModalRemisionarOrden] = useState(null);
  const [modalReporteExcel, setModalReporteExcel] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [modalCancelarRemision, setModalCancelarRemision] = useState(null);
  const [modalEditarRemision, setModalEditarRemision] = useState(null);
  const [scrollRemisionAntesEditar, setScrollRemisionAntesEditar] = useState(0);
  const [documentoImprimir, setDocumentoImprimir] = useState(null);
  const [carpetaPdfHandle, setCarpetaPdfHandle] = useState(null);
  const [nombreCarpetaPdf, setNombreCarpetaPdf] = useState('');
  const [estadoFiltroOrden, setEstadoFiltroOrden] = useState('TODOS');
  
  useEffect(() => {
    leerHandleCarpetaPDF().then(handle => {
      if (handle) { setCarpetaPdfHandle(handle); setNombreCarpetaPdf(handle.name || 'Carpeta seleccionada'); }
    }).catch(error => console.warn('No se pudo recuperar la carpeta local de PDF:', error));
  }, []);

  const seleccionarCarpetaPDF = async () => {
    if (!window.showDirectoryPicker) {
      alert('Tu navegador no permite seleccionar una carpeta local. Usa Google Chrome o Microsoft Edge actualizado en Windows.');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      const permiso = await handle.requestPermission({ mode: 'readwrite' });
      if (permiso !== 'granted') { alert('No se concedió permiso para guardar archivos en esa carpeta.'); return; }
      await guardarHandleCarpetaPDF(handle);
      setCarpetaPdfHandle(handle);
      setNombreCarpetaPdf(handle.name || 'Carpeta seleccionada');
      await setEmpresa({ ...empresa, rutaDescargaPdf: handle.name || 'Carpeta seleccionada' });
      alert('Carpeta predeterminada configurada correctamente en este equipo y navegador.');
    } catch (error) {
      if (error?.name !== 'AbortError') { console.error(error); alert('No fue posible configurar la carpeta.'); }
    }
  };

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

  // Estados nuevos para búsqueda y ordenamiento por fecha en Remisiones y Ventas
  const [facturasFiltroInicio, setFacturasFiltroInicio] = useState('');
  const [facturasFiltroFin, setFacturasFiltroFin] = useState('');
  const [facturasBusqueda, setFacturasBusqueda] = useState('');
  const [facturasOrdenFecha, setFacturasOrdenFecha] = useState('recientes'); // 'recientes' o 'antiguas'
  const [ordenesBusqueda, setOrdenesBusqueda] = useState('');
  const [ordenesFiltroInicio, setOrdenesFiltroInicio] = useState('');
  const [ordenesFiltroFin, setOrdenesFiltroFin] = useState('');
  const [ordenesOrdenFecha, setOrdenesOrdenFecha] = useState('recientes');

  const [tipoClienteOpt, setTipoClienteOpt] = useState('EXISTENTE');
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaDirectorioClientes, setBusquedaDirectorioClientes] = useState('');
  const [mostrarTelefonoSecundario, setMostrarTelefonoSecundario] = useState(false);
  const [importacionClientes, setImportacionClientes] = useState({ visible: false, activa: false, porcentaje: 0, procesados: 0, total: 0, etapa: '' });
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [formNuevoCliente, setFormNuevoCliente] = useState({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' });
  
  const [formOrden, setFormOrden] = useState({ 
    tipo_equipo: 'PORTATIL', 
    marca_modelo: '', 
    serie: '', 
    fallo_reportado: '', 
    valor_estimado: 0,
    deja_cargador: false,
    serie_cargador: '',
    repuesto_compra_id: ''
  });

  const [editOrdForm, setEditOrdForm] = useState({ estado: '', observacion: '', diagnostico: '', presupuesto: 0, totalPagar: 0, repuestoCompraId: '', clienteNombre: '', clienteTelefono: '', clienteTelefonoSecundario: '', clienteCedula: '', clienteEmail: '', clienteDireccion: '', tipoEquipo: '', marcaModelo: '', serie: '', dejaCargador: false, serieCargador: '', falloReportado: '' });


  // Abre el flujo correspondiente sin mezclar la edición de datos de ingreso con Diagnóstico.
  const abrirEdicionOrden = (orden, modo = 'diagnostico') => {
    const clienteRelacionado = clientes.find(c =>
      (orden.cliente_id && String(c.id) === String(orden.cliente_id)) ||
      (normalizarBusqueda(c.nombre) === normalizarBusqueda(orden.cliente_nombre) && String(c.telefono || '') === String(orden.cliente_telefono || ''))
    );
    setModalEditOrdenModo(modo);
    setModalEditOrden(orden);
    setEditOrdForm({
      estado: orden.estado,
      observacion: '',
      diagnostico: orden.diagnostico || '',
      presupuesto: orden.valor_estimado || 0,
      totalPagar: orden.total_pagar || 0,
      repuestoCompraId: orden.repuesto_compra_id || '',
      garantiaAplica: obtenerGarantiaOrden(orden).aplica,
      garantiaTiempo: obtenerGarantiaOrden(orden).tiempo,
      clienteNombre: orden.cliente_nombre || '',
      clienteTelefono: orden.cliente_telefono || '',
      clienteTelefonoSecundario: clienteRelacionado?.telefono_secundario || '',
      clienteCedula: clienteRelacionado?.cedula || '',
      clienteEmail: clienteRelacionado?.email || orden.cliente_email || '',
      clienteDireccion: clienteRelacionado?.direccion || '',
      tipoEquipo: orden.tipo_equipo || '',
      marcaModelo: orden.marca_modelo || '',
      serie: orden.serie || '',
      dejaCargador: !!orden.deja_cargador,
      serieCargador: orden.serie_cargador || '',
      falloReportado: orden.fallo_reportado || orden.falla_reportado || ''
    });
  };
  
  const [tipoClienteVentaOpt, setTipoClienteVentaOpt] = useState('EXISTENTE');
  const [busquedaClienteVenta, setBusquedaClienteVenta] = useState('');
  const [clienteVentaSeleccionado, setClienteVentaSeleccionado] = useState(null);
  const [formNuevoClienteVenta, setFormNuevoClienteVenta] = useState({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' });
  const [itemsVenta, setItemsVenta] = useState([{ descripcion: '', cantidad: 1, precio: 0 }]);
  const [tipoClienteCot, setTipoClienteCot] = useState('EXISTENTE');
  const [busquedaClienteCot, setBusquedaClienteCot] = useState('');
  const [clienteCotSeleccionado, setClienteCotSeleccionado] = useState(null);
  const [formNuevoClienteCot, setFormNuevoClienteCot] = useState({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' });
  const [tipoCotizacion, setTipoCotizacion] = useState('INDIVIDUAL');
  const [opcionesCotizacion, setOpcionesCotizacion] = useState([[{ descripcion: '', cantidad: 1, precio: 0 }]]);
  const [cotizacionesBusqueda, setCotizacionesBusqueda] = useState('');
  const [cotizacionActiva, setCotizacionActiva] = useState(null);
  const [guardandoCotizacion, setGuardandoCotizacion] = useState(false);
  const [compraSeleccionadaVentaId, setCompraSeleccionadaVentaId] = useState('');
  const [garantiaVentaAplica, setGarantiaVentaAplica] = useState(false);
  const [garantiaVentaTiempo, setGarantiaVentaTiempo] = useState('');

  const [formCompra, setFormCompra] = useState({ proveedor: '', descripcion_producto: '', costo: 0, precio_venta_sugerido: '' });
  const [comprasFiltroInicio, setComprasFiltroInicio] = useState('');
  const [comprasFiltroFin, setComprasFiltroFin] = useState('');
  const [comprasBusqueda, setComprasBusqueda] = useState('');
  const [mostrarHistorialPortal, setMostrarHistorialPortal] = useState(false);

  const [formNuevoRol, setFormNuevoRol] = useState({ nombre: '', permisos: { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, cancelar_remision: false, ver_configuracion: true } });
  const [formUsuarioNuevo, setFormUsuarioNuevo] = useState({ nombre: '', usuario: '', clave: '', rolId: roles[0]?.id || '' });

  const normalizarBusqueda = (valor) => String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  const obtenerIdRegistroOrden = (orden) => {
    const indiceOriginal = ordenes.findIndex(registro => registro.id === orden?.id);
    return `#${1001 + (ordenes.length - 1 - Math.max(indiceOriginal, 0))}`;
  };

  const ordenesFiltradas = [...ordenes].filter(o => {
    if (estadoFiltroOrden !== 'TODOS') {
      const estadoActual = normalizarBusqueda(o.estado);
      if (estadoFiltroOrden === 'REMISIONADO') {
        if (!estadoActual.includes('remisionado') && !o.numero_factura_asociada) return false;
      } else if (estadoActual !== normalizarBusqueda(estadoFiltroOrden)) return false;
    }
    const fechaRegistro = String(o.created_at || o.fecha || '').slice(0, 10);
    if (ordenesFiltroInicio && fechaRegistro && fechaRegistro < ordenesFiltroInicio) return false;
    if (ordenesFiltroFin && fechaRegistro && fechaRegistro > ordenesFiltroFin) return false;
    const termino = normalizarBusqueda(ordenesBusqueda);
    if (!termino) return true;
    const cliente = clientes.find(c => normalizarBusqueda(c.nombre) === normalizarBusqueda(o.cliente_nombre));
    const idRegistroConsecutivo = obtenerIdRegistroOrden(o);
    const busquedaId = termino.replace(/^#/, '');
    return normalizarBusqueda(o.cliente_nombre).includes(termino) ||
      normalizarBusqueda(o.cliente_telefono).includes(termino) ||
      normalizarBusqueda(cliente?.cedula).includes(termino) ||
      normalizarBusqueda(idRegistroConsecutivo).includes(termino) ||
      (busquedaId !== '' && String(idRegistroConsecutivo).replace(/^#/, '').includes(busquedaId));
  }).sort((a, b) => {
    const fechaA = new Date(a.created_at || a.fecha || 0).getTime() || 0;
    const fechaB = new Date(b.created_at || b.fecha || 0).getTime() || 0;
    return ordenesOrdenFecha === 'recientes'
      ? (fechaB - fechaA || Number(b.id || 0) - Number(a.id || 0))
      : (fechaA - fechaB || Number(a.id || 0) - Number(b.id || 0));
  });

  const terminoBusquedaDirectorio = normalizarBusqueda(busquedaDirectorioClientes);
  const digitosBusquedaDirectorio = terminoBusquedaDirectorio.replace(/\D/g, '');
  const clientesFiltradosDirectorio = clientes.filter(c => {
    if (!terminoBusquedaDirectorio) return true;

    const nombre = normalizarBusqueda(c.nombre);
    const cedula = normalizarBusqueda(c.cedula);
    const telefono = normalizarBusqueda(c.telefono);
    const telefonoSecundario = normalizarBusqueda(c.telefono_secundario);

    return nombre.includes(terminoBusquedaDirectorio) ||
      cedula.includes(terminoBusquedaDirectorio) ||
      telefono.includes(terminoBusquedaDirectorio) ||
      telefonoSecundario.includes(terminoBusquedaDirectorio) ||
      (digitosBusquedaDirectorio.length > 0 && [c.telefono, c.telefono_secundario].some(t => String(t || '').replace(/\D/g, '').includes(digitosBusquedaDirectorio)));
  });

  const clientesFiltradosBusqueda = clientes.filter(c => normalizarBusqueda(`${c.nombre} ${c.telefono || ''} ${c.telefono_secundario || ''}`).includes(normalizarBusqueda(busquedaCliente)));
  const clientesFiltradosVenta = clientes.filter(c => normalizarBusqueda(`${c.nombre} ${c.telefono || ''} ${c.telefono_secundario || ''}`).includes(normalizarBusqueda(busquedaClienteVenta)));

  const enviarWhatsApp = (orden, idConsecutivoStr) => {
    const telefono = normalizarTelefonoWhatsApp(orden.cliente_telefono);

    if (!telefono) {
      alert('El cliente no tiene un teléfono válido para WhatsApp. Revisa su número en el directorio de clientes.');
      return;
    }

    const msg = `Hola *${orden.cliente_nombre}* 👋\n\nTe saludamos de *${empresa.nombre}*.\n\nTu orden *${idConsecutivoStr}* (*${orden.tipo_equipo} ${orden.marca_modelo}*) se encuentra en estado: *${orden.estado}*.\n\nPuedes consultar el avance, diagnóstico y estado de tu equipo ingresando a nuestra plataforma:\n🔗 https://premium-tech-sys.vercel.app/portal\n\nUtiliza tu código único: *${orden.codigo_seguimiento}*`;
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Exporta los contactos con el mismo orden de columnas que exige la importación:
  // Nombre | Teléfono | Cédula | Email | Dirección.
  const exportarClientesExcel = () => {
    if (!clientes.length) {
      alert('No hay contactos para exportar.');
      return;
    }

    const encabezados = ['Nombre', 'Teléfono', 'Cédula', 'Email', 'Dirección', 'Segundo teléfono'];
    const filas = clientes.map(c => [
      String(c.nombre ?? ''),
      String(c.telefono ?? ''),
      String(c.cedula ?? ''),
      String(c.email ?? ''),
      String(c.direccion ?? ''),
      String(c.telefono_secundario ?? '')
    ]);
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
    hoja['!cols'] = [
      { wch: 30 },
      { wch: 18 },
      { wch: 18 },
      { wch: 32 },
      { wch: 38 },
      { wch: 18 }
    ];
    // Mantiene teléfonos y cédulas como texto para conservar ceros iniciales.
    const rango = XLSX.utils.decode_range(hoja['!ref']);
    for (let fila = 1; fila <= rango.e.r; fila++) {
      for (const columna of [1, 2]) {
        const celda = hoja[XLSX.utils.encode_cell({ r: fila, c: columna })];
        if (celda) { celda.t = 's'; celda.v = String(celda.v ?? ''); }
      }
    }

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Contactos');
    XLSX.writeFile(libro, 'clientes_taller.xlsx', { bookType: 'xlsx' });
  };

  // Formato Excel antiguo .xls (BIFF8), compatible con la importación del sistema.
  const exportarClientesXLS = () => {
    if (!clientes.length) {
      alert('No hay contactos para exportar.');
      return;
    }
    const encabezados = ['Nombre', 'Teléfono', 'Cédula', 'Email', 'Dirección', 'Segundo teléfono'];
    const filas = clientes.map(c => [
      String(c.nombre ?? ''), String(c.telefono ?? ''), String(c.cedula ?? ''),
      String(c.email ?? ''), String(c.direccion ?? ''), String(c.telefono_secundario ?? '')
    ]);
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, ...filas]);
    hoja['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 32 }, { wch: 38 }, { wch: 18 }];
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Contactos');
    XLSX.writeFile(libro, 'clientes_taller.xls', { bookType: 'biff8' });
  };

  // También permite descargar CSV, conservando exactamente el mismo orden de columnas.
  const exportarClientesCSV = () => {
    if (!clientes.length) {
      alert('No hay contactos para exportar.');
      return;
    }
    const escaparCSV = valor => `"${String(valor ?? '').replace(/"/g, '""')}"`;
    const filas = [
      ['Nombre', 'Teléfono', 'Cédula', 'Email', 'Dirección', 'Segundo teléfono'],
      ...clientes.map(c => [c.nombre, c.telefono, c.cedula, c.email, c.direccion, c.telefono_secundario])
    ];
    const csv = '\uFEFF' + filas.map(fila => fila.map(escaparCSV).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clientes_taller.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Importa clientes desde Excel/CSV respetando el orden fijo de columnas:
  // Nombre | Teléfono | Cédula | Email | Dirección.
  // Si la cédula ya existe, la fila se omite para evitar duplicados.
  const importarClientesExcel = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setImportacionClientes({ visible: true, activa: true, porcentaje: 0, procesados: 0, total: 0, etapa: 'Preparando archivo...' });

    try {
      const extension = archivo.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(extension)) {
        setImportacionClientes(prev => ({ ...prev, etapa: 'Formato no válido.' }));
        alert('Formato no válido. Selecciona un archivo Excel (.xlsx, .xls) o CSV.');
        return;
      }

      setImportacionClientes(prev => ({ ...prev, etapa: 'Leyendo archivo...' }));
      const contenido = await archivo.arrayBuffer();
      const libro = XLSX.read(contenido, { type: 'array', raw: false });
      const primeraHoja = libro.Sheets[libro.SheetNames[0]];
      if (!primeraHoja) {
        setImportacionClientes(prev => ({ ...prev, etapa: 'El archivo no contiene datos.' }));
        alert('El archivo no contiene una hoja de datos.');
        return;
      }

      const filas = XLSX.utils.sheet_to_json(primeraHoja, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false
      });

      if (!filas.length) {
        setImportacionClientes(prev => ({ ...prev, etapa: 'El archivo está vacío.' }));
        alert('El archivo está vacío.');
        return;
      }

      const normalizarCedulaImportacion = valor => String(valor ?? '')
        .trim()
        .replace(/[.\s-]/g, '')
        .toLowerCase();

      // Reconoce y omite una primera fila de encabezados si existe.
      const primeraFila = filas[0].slice(0, 5).map(v => String(v ?? '').trim().toLowerCase());
      const tieneEncabezado = primeraFila.some(v => ['nombre', 'telefono', 'teléfono', 'cedula', 'cédula'].includes(v));
      const filasDatos = tieneEncabezado ? filas.slice(1) : filas;

      const cedulasExistentes = new Set(
        clientes
          .map(c => normalizarCedulaImportacion(c.cedula))
          .filter(Boolean)
      );
      const cedulasArchivo = new Set();
      const nuevosClientes = [];
      let filasInvalidas = 0;
      let duplicados = 0;

      filasDatos.forEach(fila => {
        const nombre = String(fila[0] ?? '').trim();
        const telefono = String(fila[1] ?? '').trim();
        const cedula = String(fila[2] ?? '').trim();
        const email = String(fila[3] ?? '').trim();
        const direccion = String(fila[4] ?? '').trim();
        const telefono_secundario = String(fila[5] ?? '').trim() || null;

        // Nombre y teléfono son los únicos campos obligatorios.
        if (!nombre || !telefono) {
          filasInvalidas++;
          return;
        }

        const cedulaNormalizada = normalizarCedulaImportacion(cedula);
        if (cedulaNormalizada && (cedulasExistentes.has(cedulaNormalizada) || cedulasArchivo.has(cedulaNormalizada))) {
          duplicados++;
          return;
        }

        if (cedulaNormalizada) cedulasArchivo.add(cedulaNormalizada);
        nuevosClientes.push({ nombre, telefono, telefono_secundario, cedula, email, direccion });
      });

      if (!nuevosClientes.length) {
        setImportacionClientes(prev => ({ ...prev, etapa: 'No hay clientes nuevos para importar.' }));
        alert(`No hay clientes nuevos para importar.\nDuplicados omitidos: ${duplicados}.\nFilas inválidas (sin nombre o teléfono): ${filasInvalidas}.`);
        return;
      }

      let clientesInsertados = [];
      const totalClientes = nuevosClientes.length;
      const tamanoLote = 25;
      setImportacionClientes(prev => ({
        ...prev,
        total: totalClientes,
        porcentaje: 0,
        procesados: 0,
        etapa: 'Guardando contactos en Supabase...'
      }));

      // Inserta por lotes pequeños para actualizar la barra durante la subida.
      for (let i = 0; i < totalClientes; i += tamanoLote) {
        const lote = nuevosClientes.slice(i, i + tamanoLote);
        const { data, error } = await supabase.from('clientes').insert(lote).select();
        if (error) {
          console.error('Error importando clientes:', error);
          if (clientesInsertados.length) {
            setClientes(prev => [...clientesInsertados, ...prev]);
          }
          setImportacionClientes(prev => ({
            ...prev,
            etapa: `Importación interrumpida: ${clientesInsertados.length} de ${totalClientes} contactos guardados.`
          }));
          alert(`La importación se detuvo por un error de Supabase: ${error.message}\nClientes guardados antes del error: ${clientesInsertados.length}.`);
          return;
        }
        if (data?.length) clientesInsertados = [...clientesInsertados, ...data];

        const procesados = Math.min(i + lote.length, totalClientes);
        setImportacionClientes(prev => ({
          ...prev,
          procesados,
          porcentaje: Math.round((procesados / totalClientes) * 100),
          etapa: `Guardando contactos en Supabase... ${procesados} de ${totalClientes}`
        }));
      }

      setClientes(prev => [...clientesInsertados, ...prev]);
      setImportacionClientes(prev => ({ ...prev, porcentaje: 100, procesados: clientesInsertados.length, etapa: '¡Importación completada correctamente!' }));
      alert(`Importación completada.\nClientes importados: ${clientesInsertados.length}.\nDuplicados omitidos por cédula: ${duplicados}.\nFilas inválidas (sin nombre o teléfono): ${filasInvalidas}.`);
    } catch (error) {
      console.error('Error leyendo el archivo de clientes:', error);
      setImportacionClientes(prev => ({ ...prev, etapa: 'Error al procesar el archivo.' }));
      alert(`No se pudo leer el archivo. Verifica que sea un Excel o CSV válido.\n${error.message || ''}`);
    } finally {
      setImportacionClientes(prev => ({ ...prev, activa: false }));
      evento.target.value = '';
    }
  };

  const generarReporteExcel = () => {
    const { fechaInicio, fechaFin, tipo } = reporteFiltro;

    const filtradas = facturas.filter(f => {
      if (facturaEstaCancelada(f)) return false;
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

    csvContent += `\r\n,,, ,TOTALES DEL PERIODOS:,"$${sumaTotalCostos}","$${sumaTotalVentas}","$${sumaTotalGanancias}"\r\n`;

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
    ? { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, cancelar_remision: usuarioSesion?.id === 'emergencia' ? true : (permisosRol.cancelar_remision ?? false), ver_configuracion: true }
    : {
        crear_orden: permisosRol.crear_orden ?? true,
        editar_diagnostico: permisosRol.editar_diagnostico ?? true,
        ver_clientes: permisosRol.ver_clientes ?? true,
        editar_clientes: permisosRol.editar_clientes ?? true,
        facturar: permisosRol.facturar ?? true,
        cancelar_remision: permisosRol.cancelar_remision ?? false,
        ver_configuracion: permisosRol.ver_configuracion ?? true,
    };

  // Indicadores del dashboard: se calculan con los registros que ya carga AppProvider.
  const facturasValidas = facturas.filter(f => !facturaEstaCancelada(f));
  const totalFacturado = facturasValidas.reduce((suma, f) => suma + (Number(f.total) || 0), 0);
  // Utilidad estimada registrada: venta menos costo asociado guardado en cada remisión.
  const utilidadTotalDashboard = facturasValidas.reduce((suma, f) => suma + (Number(f.total || 0) - Number(f.costo_compra || 0)), 0);
  const contarEstado = (...estados) => ordenes.filter(o => estados.includes(String(o.estado || '').trim())).length;
  const estadoDashboard = [
    { label: 'Recibido', count: contarEstado('Ingresado'), color: 'bg-slate-500' },
    { label: 'En Diagnóstico', count: contarEstado('En Diagnóstico'), color: 'bg-purple-500' },
    { label: 'Esperando Repuesto', count: contarEstado('Esperando Repuesto'), color: 'bg-amber-400' },
    { label: 'En Reparación', count: contarEstado('En Reparación'), color: 'bg-blue-500' },
    { label: 'Listo para Entrega', count: contarEstado('Reparado / Listo', 'No tiene reparación'), color: 'bg-emerald-500' },
    { label: 'Entregado', count: contarEstado('Entregado / Remisionado'), color: 'bg-slate-400' }
  ];
  const totalOrdenesDashboard = ordenes.length;
  const ordenesEnProcesoDashboard = contarEstado('En Diagnóstico', 'Esperando Repuesto', 'En Reparación');
  const ordenesListasDashboard = contarEstado('Reparado / Listo', 'No tiene reparación');
  // El esquema actual no maneja existencias. Este indicador usa órdenes detenidas por repuesto como alerta operativa.
  const repuestosPorReponerDashboard = contarEstado('Esperando Repuesto');
  const ingresosRecientesDashboard = [...facturasValidas]
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || Number(b.id || 0) - Number(a.id || 0))
    .slice(0, 5);
  const formatoCOP = valor => `$${Number(valor || 0).toLocaleString('es-CO')}`;

  return (
    <div className="app-shell flex min-h-screen bg-transparent text-slate-100 font-sans">
      <style>{`
        /* Identidad visual: elegante, limpia y con movimiento discreto */
        .app-shell {
          background:
            radial-gradient(ellipse at 82% 0%, rgba(8,145,178,.10), transparent 34%),
            radial-gradient(ellipse at 5% 92%, rgba(99,102,241,.08), transparent 30%),
            transparent;
          letter-spacing: .005em;
        }
        .app-shell aside {
          background: rgba(8, 15, 31, .94);
          border-color: rgba(71, 85, 105, .42);
          box-shadow: 12px 0 36px rgba(0,0,0,.12);
          backdrop-filter: blur(16px);
        }
        .app-shell aside nav button {
          position: relative;
          border: 1px solid transparent;
          transition: background .2s ease, color .2s ease, border-color .2s ease, transform .2s ease;
        }
        .app-shell aside nav button:hover {
          transform: translateX(3px);
          background: rgba(30,41,59,.78);
          border-color: rgba(100,116,139,.22);
          color: #e2e8f0;
        }
        .app-shell aside nav button[class*="bg-indigo-600"] {
          background: linear-gradient(115deg, rgba(8,145,178,.25), rgba(79,70,229,.24)) !important;
          border-color: rgba(34,211,238,.28) !important;
          color: #67e8f9 !important;
          box-shadow: inset 3px 0 0 #22d3ee, 0 8px 22px rgba(8,145,178,.08) !important;
        }
        .app-shell main {
          animation: appFadeIn .42s ease both;
        }
        .app-shell main section,
        .app-shell main > div > div[class*="bg-slate-900"],
        .app-shell main > div > div[class*="rounded-2xl"] {
          transition: border-color .22s ease, box-shadow .22s ease, transform .22s ease;
        }
        .app-shell main section {
          background: linear-gradient(145deg, rgba(22,32,51,.96), rgba(15,23,42,.96));
          border-color: rgba(71,85,105,.34);
          box-shadow: 0 12px 32px rgba(0,0,0,.12);
        }
        .app-shell main section:hover {
          border-color: rgba(100,116,139,.48);
          box-shadow: 0 16px 36px rgba(0,0,0,.18);
        }
        .app-shell main button {
          transition: transform .18s ease, filter .18s ease, box-shadow .18s ease;
        }
        .app-shell main button:hover {
          filter: brightness(1.08);
        }
        .app-shell main button:active {
          transform: scale(.975);
        }
        .app-shell input, .app-shell select, .app-shell textarea {
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }
        .app-shell input:focus, .app-shell select:focus, .app-shell textarea:focus {
          outline: none;
          border-color: rgba(34,211,238,.68) !important;
          box-shadow: 0 0 0 3px rgba(34,211,238,.10);
        }
        .app-shell table { border-collapse: separate; border-spacing: 0; }
        .app-shell th {
          color: #94a3b8;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: .08em;
        }
        .app-shell ::-webkit-scrollbar { width: 8px; height: 8px; }
        .app-shell ::-webkit-scrollbar-track { background: rgba(15,23,42,.55); }
        .app-shell ::-webkit-scrollbar-thumb { background: #334155; border-radius: 20px; }
        .app-shell ::-webkit-scrollbar-thumb:hover { background: #475569; }
        @keyframes appFadeIn {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (max-width: 767px) {
          .app-shell { flex-direction: column; }
          .app-shell aside {
            width: 100%;
            min-height: auto;
            padding: 14px;
            gap: 12px;
            position: relative;
          }
          .app-shell aside > div:first-child { gap: 12px; }
          .app-shell aside nav {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .app-shell aside nav button {
            padding: 10px !important;
            font-size: 11px;
            min-height: 42px;
          }
          .app-shell aside nav button:hover { transform: translateY(-1px); }
          .app-shell aside > div:last-child {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding-top: 10px;
          }
          .app-shell aside > div:last-child button { width: auto; padding: 9px 12px; }
          .app-shell main { padding: 18px 14px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .app-shell *, .app-shell *::before, .app-shell *::after {
            animation-duration: .01ms !important;
            transition-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
        @media print {
          main.no-imprimir { display: block !important; }
          body * { visibility: hidden !important; }
          #documento-cotizacion, #documento-cotizacion * { visibility: visible !important; }
          #documento-cotizacion { position: absolute; left: 0; top: 0; width: 100%; background: white !important; color: #111827 !important; }
          .no-imprimir { display: none !important; }
        }
      `}</style>
      
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
            <button onClick={() => setTab('dashboard')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>▦ Dashboard</button>
            {permisos.crear_orden && <button onClick={() => setTab('nueva_orden')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'nueva_orden' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>➕ Orden de Entrada/Taller</button>}
            <button onClick={() => setTab('ordenes')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'ordenes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🛠️ Reparaciones y Estado</button>
            {permisos.ver_clientes && <button onClick={() => setTab('clientes')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'clientes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>👥 Directorio de Clientes</button>}
            {permisos.facturar && <button onClick={() => setTab('facturacion')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'facturacion' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🧾 Remisiones y Ventas</button>}
            {permisos.facturar && <button onClick={() => setTab('compras')} className={`w-full text-left p-3 rounded-xl transition ${tab === 'compras' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>🛒 Compras y Gastos</button>}
            <button onClick={() => { setTab('cotizador'); setCotizacionActiva(null); }} className={`w-full text-left p-3 rounded-xl transition ${tab === 'cotizador' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30' : 'text-slate-400 hover:bg-slate-800'}`}>📝 Cotizador</button>
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
        
        {/* DASHBOARD PRINCIPAL */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold text-white">Panel de Control</h2>
                <p className="text-xs text-slate-400 mt-1">Resumen operativo del taller en tiempo real</p>
              </div>
              {permisos.crear_orden && (
                <button onClick={() => setTab('nueva_orden')} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition">
                  + Ingresar Equipo
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">En proceso</p><p className="text-2xl font-extrabold text-white mt-1">{ordenesEnProcesoDashboard}</p><p className="text-[11px] text-slate-500 mt-1">Diagnóstico / Reparación</p></div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 text-2xl">◷</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Listos para entrega</p><p className="text-2xl font-extrabold text-emerald-400 mt-1">{ordenesListasDashboard}</p><p className="text-[11px] text-slate-500 mt-1">Pendiente retiro de cliente</p></div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl">✓</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Ingresos facturados</p><p className="text-2xl font-extrabold text-cyan-400 mt-1">{formatoCOP(totalFacturado)}</p><p className="text-[11px] text-slate-500 mt-1">Remisiones no canceladas</p></div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 text-2xl">$</div>
              </div>
              <div className="bg-slate-900 border border-emerald-800/60 rounded-2xl p-4 flex items-center justify-between">
                <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Utilidad total</p><p className="text-2xl font-extrabold text-emerald-400 mt-1">{ocultarUtilidad ? '••••••' : formatoCOP(utilidadTotalDashboard)}</p><p className="text-[11px] text-slate-500 mt-1">Ventas menos costos registrados</p></div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl">📈</div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div><p className="text-[11px] text-slate-400 uppercase tracking-wide">Repuestos por reponer</p><p className="text-2xl font-extrabold text-amber-400 mt-1">{repuestosPorReponerDashboard}</p><p className="text-[11px] text-slate-500 mt-1">Órdenes esperando repuesto</p></div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-2xl">⚠</div>
              </div>
            </div>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-white">Estado del Taller</h3>
                <span className="text-cyan-400 text-lg">⌁</span>
              </div>
              <div className="space-y-3">
                {estadoDashboard.map((item) => {
                  const porcentaje = totalOrdenesDashboard ? Math.round((item.count / totalOrdenesDashboard) * 100) : 0;
                  return (
                    <div key={item.label}>
                      <div className="flex justify-between gap-3 text-[11px] mb-1.5">
                        <span className="text-slate-300">{item.label}</span>
                        <span className="text-slate-400 tabular-nums">{item.count} ({porcentaje}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full ${item.color} transition-all`} style={{ width: `${porcentaje}%` }} />
                      </div>
                    </div>
                  );
                })}
                {!totalOrdenesDashboard && <p className="text-xs text-slate-500 text-center py-2">Aún no hay órdenes registradas.</p>}
              </div>
              <p className="text-[10px] text-slate-500 mt-4">Total de órdenes: {totalOrdenesDashboard}. Los porcentajes se calculan sobre todas las órdenes registradas.</p>
            </section>

            <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div><h3 className="font-bold text-white">Ingresos Recientes</h3><p className="text-[11px] text-slate-500 mt-1">Últimas remisiones registradas, excluyendo canceladas</p></div>
                <button onClick={() => setTab('facturacion')} className="text-cyan-400 hover:text-cyan-300 text-xs font-bold">Ver todas →</button>
              </div>
              <div className="space-y-2">
                {ingresosRecientesDashboard.length ? ingresosRecientesDashboard.map(f => (
                  <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 last:border-0 pb-2 last:pb-0">
                    <div><p className="text-xs font-semibold text-white">{f.numero_factura || 'Remisión'}</p><p className="text-[11px] text-slate-400">{f.cliente_nombre || 'Cliente'} · {f.fecha || 'Sin fecha'}</p></div>
                    <p className="text-sm font-bold text-emerald-400">{formatoCOP(f.total)}</p>
                  </div>
                )) : <p className="text-xs text-slate-500">Todavía no hay ingresos facturados.</p>}
              </div>
            </section>
          </div>
        )}

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
                              <p className="font-bold text-white">{c.nombre}</p><p className="text-[11px] text-indigo-400">Tel: {c.telefono}{c.telefono_secundario ? ` · ${c.telefono_secundario}` : ''}</p>
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
                    <div className="flex gap-1"><input placeholder="Teléfono / WhatsApp *" className="min-w-0 flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.telefono} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono: e.target.value })} /><button type="button" title="Agregar segundo teléfono" onClick={() => setMostrarTelefonoSecundario(v => !v)} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-3 font-black">{mostrarTelefonoSecundario ? '−' : '+'}</button></div>
                    <input placeholder="Cédula" className="bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.cedula} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, cedula: e.target.value })} />
                  </div>
                  {mostrarTelefonoSecundario && <input placeholder="Segundo teléfono (opcional)" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-xs text-white" value={formNuevoCliente.telefono_secundario || ''} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono_secundario: e.target.value })} />}
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

                </div>
                {formOrden.deja_cargador && (
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Número de serie del cargador</label>
                    <input 
                      placeholder="N° de serie (S/N) del cargador" 
                      className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" 
                      value={formOrden.serie_cargador} 
                      onChange={e => setFormOrden({ ...formOrden, serie_cargador: e.target.value })} 
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
                  setFormNuevoCliente({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' }); setMostrarTelefonoSecundario(false);
                  setFormOrden({ tipo_equipo: 'PORTATIL', marca_modelo: '', serie: '', fallo_reportado: '', valor_estimado: 0, deja_cargador: false, serie_cargador: '', repuesto_compra_id: '' });
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
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3 items-end text-xs">
              <div className="lg:col-span-2">
                <label className="text-slate-400 block mb-1 font-semibold">🔍 Buscar ID de registro, nombre, cédula o celular</label>
                <input value={ordenesBusqueda} onChange={e => setOrdenesBusqueda(e.target.value)} placeholder="ID (ej. 1001), nombre, cédula o celular..." className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Desde</label>
                <input type="date" value={ordenesFiltroInicio} onChange={e => setOrdenesFiltroInicio(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Hasta</label>
                <input type="date" value={ordenesFiltroFin} onChange={e => setOrdenesFiltroFin(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Orden por fecha</label>
                <select value={ordenesOrdenFecha} onChange={e => setOrdenesOrdenFecha(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white">
                  <option value="recientes">Más recientes primero</option>
                  <option value="antiguas">Más antiguas primero</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Filtrar por estado</label>
                <select value={estadoFiltroOrden} onChange={e => setEstadoFiltroOrden(e.target.value)} className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white">
                  <option value="TODOS">Todos los estados</option>
                  <option value="Reparado / Listo">Reparado y listo</option>
                  <option value="REMISIONADO">Remisionado</option>
                  <option value="En Diagnóstico">En diagnóstico</option>
                  <option value="Ingresado">Ingresado</option>
                  <option value="No tiene reparación">No tiene reparación</option>
                </select>
              </div>
              <div className="lg:col-span-6 flex items-center justify-between gap-2">
                <span className="text-slate-500">{ordenesFiltradas.length} de {ordenes.length} órdenes</span>
                <button onClick={() => { setOrdenesBusqueda(''); setOrdenesFiltroInicio(''); setOrdenesFiltroFin(''); setOrdenesOrdenFecha('recientes'); setEstadoFiltroOrden('TODOS'); }} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl font-semibold">✕ Limpiar filtros</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400 uppercase">
                  <tr><th className="p-3">ID Registro</th><th className="p-3">Código Cliente</th><th className="p-3">Cliente / Atendió</th><th className="p-3">Equipo & Accesorios</th><th className="p-3">Estado</th><th className="p-3">Presupuesto / Total Pagar</th><th className="p-3 text-right">Acciones</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {ordenesFiltradas.map((o) => {
                    const idRegistroConsecutivo = obtenerIdRegistroOrden(o);
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
                            {o.deja_cargador && <span className="bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800">🔌 Cargador {o.serie_cargador ? `(${o.serie_cargador})` : '(S/N no registrado)'}</span>}
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
                          {permisos.editar_diagnostico && <><button onClick={() => abrirEdicionOrden(o, 'diagnostico')} className="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-[11px]">🩺 Diagnóstico</button><button onClick={() => abrirEdicionOrden(o, 'editar')} className="bg-amber-600 hover:bg-amber-500 text-white px-2 py-1 rounded text-[11px]">✏️ Editar</button></>}
                          <button onClick={() => enviarWhatsApp(o, idRegistroConsecutivo)} className="bg-emerald-600 text-white px-2 py-1 rounded text-[11px]">💬 WhatsApp</button>
                          <button onClick={() => setDocumentoImprimir({ tipo: 'ORDEN', data: o, idConsecutivo: idRegistroConsecutivo })} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">🖨️ PDF</button>
                          {(o.estado === 'Reparado / Listo' || o.estado === 'No tiene reparación') && permisos.facturar && <button onClick={() => setModalRemisionarOrden({ orden: o, compraId: o.repuesto_compra_id || '', garantiaAplica: obtenerGarantiaOrden(o).aplica, garantiaTiempo: obtenerGarantiaOrden(o).tiempo })} className="bg-emerald-500 text-white px-2 py-1 rounded text-[11px] font-bold">📄 Remisionar</button>}
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
            <div className="flex justify-between items-center flex-wrap gap-2"><h2 className="text-xl font-bold text-white">Directorio de Clientes</h2><div className="flex items-center gap-2 flex-wrap"><button onClick={exportarClientesExcel} className="bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl text-xs">📊 Exportar XLSX</button><button onClick={exportarClientesXLS} className="bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs">📗 Exportar XLS</button><button onClick={exportarClientesCSV} className="bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs">📄 Exportar CSV</button>{permisos.editar_clientes && <><label className={`bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold ${importacionClientes.activa ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}>📥 {importacionClientes.activa ? 'Importando...' : 'Importar Excel'}<input type="file" accept=".xlsx,.xls,.csv" onChange={importarClientesExcel} className="hidden" disabled={importacionClientes.activa} /></label><button onClick={() => { setModalEditCliente({}); setFormNuevoCliente({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' }); setMostrarTelefonoSecundario(false); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold">+ Nuevo Cliente</button></>}</div></div>
            <p className="text-[11px] text-slate-500">Importa archivos Excel o CSV con las columnas en este orden: Nombre, Teléfono, Cédula, Email y Dirección. Los clientes con cédula repetida se omiten.</p>
            {importacionClientes.visible && (
              <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-4 space-y-2" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-semibold text-slate-200">{importacionClientes.etapa}</span>
                  <span className="font-bold text-indigo-300 tabular-nums">{importacionClientes.porcentaje}%</span>
                </div>
                <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-600 to-emerald-500 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${importacionClientes.porcentaje}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>{importacionClientes.procesados.toLocaleString('es-CO')} de {importacionClientes.total.toLocaleString('es-CO')} contactos guardados</span>
                  {importacionClientes.activa && <span className="text-indigo-300">Procesando...</span>}
                </div>
              </div>
            )}
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
                          <th className="p-3">Segundo teléfono</th>
                          <th className="p-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {clientesFiltradosDirectorio.map(c => (
                          <tr key={c.id} className="hover:bg-slate-800/40">
                            <td className="p-3 font-bold text-white">{c.nombre}</td>
                            <td className="p-3 text-slate-300">{c.cedula || '—'}</td>
                            <td className="p-3 text-indigo-400">{c.telefono || '—'}</td>
                            <td className="p-3 text-indigo-300">{c.telefono_secundario || '—'}</td>
                            <td className="p-3 text-right space-x-1">
                              {permisos.editar_clientes && <button onClick={() => { setModalEditCliente(c); setFormNuevoCliente({ nombre: c.nombre || '', telefono: c.telefono || '', telefono_secundario: c.telefono_secundario || '', cedula: c.cedula || '', email: c.email || '', direccion: c.direccion || '' }); setMostrarTelefonoSecundario(!!c.telefono_secundario); }} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">✏️ Editar</button>}
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
                <button onClick={() => { setModalVenta(true); setTipoClienteVentaOpt('EXISTENTE'); setClienteVentaSeleccionado(null); setCompraSeleccionadaVentaId(''); setGarantiaVentaAplica(false); setGarantiaVentaTiempo(''); }} className="bg-emerald-600 text-white px-3 py-2 rounded-xl text-xs font-bold">+ Venta Directa</button>
              </div>
            </div>

            {/* BÚSQUEDA POR CLIENTE Y TELÉFONO + FILTROS DE FECHA */}
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/80 space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">🔍 Buscar remisión o venta por nombre o número de teléfono</label>
                <div className="flex gap-2">
                  <input type="search" value={facturasBusqueda} onChange={e => setFacturasBusqueda(e.target.value)} placeholder="Nombre del cliente, teléfono principal o secundario, número de remisión..." className="min-w-0 flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white placeholder-slate-500" />
                  {facturasBusqueda && <button type="button" onClick={() => setFacturasBusqueda('')} className="bg-slate-700 hover:bg-slate-600 text-white px-3 rounded-xl">Limpiar</button>}
                </div>
              </div>
              <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">🔍 Desde la fecha</label>
                <input 
                  type="date" 
                  className="bg-slate-800 border border-slate-700 p-2 rounded-xl text-white"
                  value={facturasFiltroInicio}
                  onChange={e => setFacturasFiltroInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">🔍 Hasta la fecha</label>
                <input 
                  type="date" 
                  className="bg-slate-800 border border-slate-700 p-2 rounded-xl text-white"
                  value={facturasFiltroFin}
                  onChange={e => setFacturasFiltroFin(e.target.value)}
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">⚡ Ordenar por Fecha</label>
                <select 
                  className="bg-slate-800 border border-slate-700 p-2 rounded-xl text-white font-bold"
                  value={facturasOrdenFecha}
                  onChange={e => setFacturasOrdenFecha(e.target.value)}
                >
                  <option value="recientes">Más recientes primero</option>
                  <option value="antiguas">Más antiguas primero</option>
                </select>
              </div>
              {(facturasFiltroInicio || facturasFiltroFin) && (
                <div>
                  <button 
                    onClick={() => { setFacturasFiltroInicio(''); setFacturasFiltroFin(''); }}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-xl font-semibold transition"
                  >
                    ✕ Limpiar Fechas
                  </button>
                </div>
              )}
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
                  {(() => {
                    // Filtrar por rango de fechas si están definidas
                    const terminoFactura = normalizarBusqueda(facturasBusqueda);
                    const digitosFactura = terminoFactura.replace(/\D/g, '');
                    const facturasFiltradas = facturas.filter(f => {
                      if (facturasFiltroInicio && f.fecha < facturasFiltroInicio) return false;
                      if (facturasFiltroFin && f.fecha > facturasFiltroFin) return false;
                      if (!terminoFactura) return true;
                      const clienteFactura = clientes.find(c =>
                        (f.cliente_id && String(c.id) === String(f.cliente_id)) ||
                        (normalizarBusqueda(c.nombre) === normalizarBusqueda(f.cliente_nombre) &&
                         (!f.cliente_telefono || String(c.telefono || '') === String(f.cliente_telefono)))
                      );
                      const coincideTelefono = digitosFactura.length > 0 && [f.cliente_telefono, clienteFactura?.telefono, clienteFactura?.telefono_secundario].some(t => String(t || '').replace(/\D/g, '').includes(digitosFactura));
                      return normalizarBusqueda(f.cliente_nombre).includes(terminoFactura) ||
                        normalizarBusqueda(f.numero_factura).includes(terminoFactura) ||
                        coincideTelefono;
                    });

                    // Ordenar según la selección del usuario
                    const facturasOrdenadas = [...facturasFiltradas].sort((a, b) => {
                      if (facturasOrdenFecha === 'recientes') {
                        return new Date(b.fecha) - new Date(a.fecha) || b.id - a.id;
                      } else {
                        return new Date(a.fecha) - new Date(b.fecha) || a.id - b.id;
                      }
                    });

                    if (facturasOrdenadas.length === 0) {
                      return (
                        <tr>
                          <td colSpan={ocultarUtilidad ? 5 : 6} className="text-center py-8 text-slate-400">
                            No se encontraron remisiones o ventas en el rango de fechas seleccionado.
                          </td>
                        </tr>
                      );
                    }

                    return facturasOrdenadas.map(f => {
                      const totalVenta = Number(f.total || 0);
                      const costoCompra = Number(f.costo_compra || 0);
                      const utilidad = totalVenta - costoCompra;

                      return (
                        <tr key={f.id} className="hover:bg-slate-800/40">
                          <td className={`p-3 font-bold ${facturaEstaCancelada(f) ? 'text-rose-400 line-through' : 'text-indigo-400'}`}>
                            {f.numero_factura}
                            {facturaEstaCancelada(f) && <span className="block no-underline text-[10px] font-black text-rose-400 mt-1">CANCELADA</span>}
                          </td>
                          <td className="p-3 text-slate-400">{f.fecha}</td>
                          <td className="p-3 font-medium text-white">
                            {f.cliente_nombre}
                            <span className="block text-[10px] text-indigo-300 font-semibold mt-0.5">👤 Vendedor: {f.usuario_creador || 'Sistema'}</span>
                          </td>
                          <td className={`p-3 font-extrabold ${facturaEstaCancelada(f) ? 'text-rose-300 line-through' : 'text-white'}`}>$ {totalVenta.toLocaleString('es-CO')}</td>
                          
                          {!ocultarUtilidad && (
                            <td className={`p-3 font-extrabold ${facturaEstaCancelada(f) ? 'text-slate-500 line-through' : 'text-emerald-400'}`}>$ {utilidad.toLocaleString('es-CO')}</td>
                          )}

                          <td className="p-3 text-right space-x-1">
                            <button onClick={() => setFacturaSeleccionada(f)} className="bg-indigo-600 text-white px-2 py-1 rounded text-[11px]">👁️ Ver</button>
                            <button onClick={() => setDocumentoImprimir({ tipo: 'FACTURA', data: f })} className="bg-slate-800 text-white px-2 py-1 rounded text-[11px]">🖨️ PDF</button>
                            {permisos.cancelar_remision && !facturaEstaCancelada(f) && (
                              <button onClick={() => setModalCancelarRemision({ factura: f, motivo: '' })} className="bg-rose-700 hover:bg-rose-600 text-white px-2 py-1 rounded text-[11px]">⛔ Cancelar</button>
                            )}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. COMPRAS Y GASTOS */}
        {tab === 'cotizador' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-2xl font-black text-white">Cotizador</h2><p className="text-xs text-slate-400 mt-1">Cotizaciones individuales o con varias alternativas para el mismo cliente.</p></div>
              <button onClick={() => { setCotizacionActiva(null); setClienteCotSeleccionado(null); setTipoClienteCot('EXISTENTE'); setTipoCotizacion('INDIVIDUAL'); setOpcionesCotizacion([[{ descripcion: '', cantidad: 1, precio: 0 }]]); setFormNuevoClienteCot({ nombre: '', telefono: '', telefono_secundario: '', cedula: '', email: '', direccion: '' }); setMostrarTelefonoSecundario(false); }} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl text-xs font-bold">+ Nueva cotización</button>
            </div>
            {!cotizacionActiva ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5">
                <div className="flex flex-wrap gap-3 items-center">
                  <input value={cotizacionesBusqueda} onChange={e => setCotizacionesBusqueda(e.target.value)} placeholder="Buscar por número, nombre o teléfono..." className="flex-1 min-w-64 bg-slate-800 border border-slate-700 p-3 rounded-xl text-xs" />
                  <div className="flex gap-2"><button onClick={() => setTipoCotizacion('INDIVIDUAL')} className={`px-3 py-2 rounded-lg text-xs font-bold ${tipoCotizacion === 'INDIVIDUAL' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Individual</button><button onClick={() => setTipoCotizacion('MULTIPLE')} className={`px-3 py-2 rounded-lg text-xs font-bold ${tipoCotizacion === 'MULTIPLE' ? 'bg-indigo-600' : 'bg-slate-800'}`}>Múltiple</button></div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <h3 className="font-bold text-indigo-300 text-sm">Cliente</h3>
                    <div className="flex gap-2"><button onClick={() => {setTipoClienteCot('EXISTENTE');setClienteCotSeleccionado(null);}} className={`flex-1 p-2 rounded-lg text-xs font-bold ${tipoClienteCot==='EXISTENTE'?'bg-indigo-600':'bg-slate-800'}`}>Cliente existente</button><button onClick={() => {setTipoClienteCot('NUEVO');setClienteCotSeleccionado(null);}} className={`flex-1 p-2 rounded-lg text-xs font-bold ${tipoClienteCot==='NUEVO'?'bg-indigo-600':'bg-slate-800'}`}>+ Nuevo cliente</button></div>
                    {tipoClienteCot === 'EXISTENTE' ? <>
                      {!clienteCotSeleccionado ? <><input value={busquedaClienteCot} onChange={e=>setBusquedaClienteCot(e.target.value)} placeholder="Buscar cliente por nombre, cédula o teléfono" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><div className="max-h-40 overflow-auto border border-slate-800 rounded-lg">{clientes.filter(c=>normalizarBusqueda(`${c.nombre} ${c.telefono} ${c.telefono_secundario || ''} ${c.cedula}`).includes(normalizarBusqueda(busquedaClienteCot))).slice(0,30).map(c=><button key={c.id} onClick={()=>{setClienteCotSeleccionado(c);setBusquedaClienteCot('');}} className="block w-full text-left p-2.5 text-xs hover:bg-slate-800 border-b border-slate-800">{c.nombre} · {c.telefono || 'Sin teléfono'} {c.cedula ? `· CC ${c.cedula}` : ''}</button>)}</div></> : <div className="bg-slate-800 p-3 rounded-xl text-xs flex justify-between gap-2"><div><b>{clienteCotSeleccionado.nombre}</b><p className="text-slate-400">{clienteCotSeleccionado.telefono}</p></div><button onClick={()=>setClienteCotSeleccionado(null)} className="text-indigo-300">Cambiar</button></div>}
                    </> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><input value={formNuevoClienteCot.nombre} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,nombre:e.target.value})} placeholder="Nombre completo *" className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><div className="flex gap-1"><input value={formNuevoClienteCot.telefono} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,telefono:e.target.value})} placeholder="Teléfono / WhatsApp *" className="min-w-0 flex-1 bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><button type="button" title="Agregar segundo teléfono" onClick={()=>setMostrarTelefonoSecundario(v=>!v)} className="bg-indigo-600 text-white rounded-lg px-3 font-black">{mostrarTelefonoSecundario?'−':'+'}</button></div>{mostrarTelefonoSecundario && <input value={formNuevoClienteCot.telefono_secundario || ''} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,telefono_secundario:e.target.value})} placeholder="Segundo teléfono (opcional)" className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/>}<input value={formNuevoClienteCot.cedula} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,cedula:e.target.value})} placeholder="Cédula" className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><input value={formNuevoClienteCot.email} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,email:e.target.value})} placeholder="Correo" className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><input value={formNuevoClienteCot.direccion} onChange={e=>setFormNuevoClienteCot({...formNuevoClienteCot,direccion:e.target.value})} placeholder="Dirección" className="sm:col-span-2 bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/></div>}
                  </div>
                  <div className="space-y-2"><h3 className="font-bold text-indigo-300 text-sm">Datos de cotización</h3><p className="text-xs text-slate-400">Número consecutivo independiente: lo genera el sistema al guardar. Cada opción puede contener varios productos o servicios y sus cantidades y precios.</p><label className="block text-xs text-slate-400">Vigencia (opcional)</label><input id="vigenciaCotizacion" type="date" className="bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/></div>
                </div>
                <div className="space-y-4">
                  {(tipoCotizacion==='INDIVIDUAL' ? opcionesCotizacion.slice(0,1) : opcionesCotizacion).map((items,oi)=><div key={oi} className="border border-slate-700 rounded-xl p-4 space-y-3"><div className="flex items-center justify-between"><h3 className="font-bold text-white">{tipoCotizacion==='MULTIPLE'?`Opción ${oi+1}`:'Detalle de cotización'}</h3><button onClick={()=>setOpcionesCotizacion(prev=>prev.map((op,i)=>i===oi? [...op,{descripcion:'',cantidad:1,precio:0}]:op))} className="text-indigo-300 text-xs font-bold">+ Agregar producto/servicio</button></div>{items.map((it,ii)=><div key={ii} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"><input value={it.descripcion} onChange={e=>setOpcionesCotizacion(prev=>prev.map((op,i)=>i===oi?op.map((x,j)=>j===ii?{...x,descripcion:e.target.value}:x):op))} placeholder="Descripción del producto o servicio *" className="sm:col-span-6 bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><input type="number" min="1" value={it.cantidad} onChange={e=>setOpcionesCotizacion(prev=>prev.map((op,i)=>i===oi?op.map((x,j)=>j===ii?{...x,cantidad:Math.max(1,Number(e.target.value)||1)}:x):op))} placeholder="Cant." className="sm:col-span-2 bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><input type="number" min="0" value={it.precio} onChange={e=>setOpcionesCotizacion(prev=>prev.map((op,i)=>i===oi?op.map((x,j)=>j===ii?{...x,precio:Math.max(0,Number(e.target.value)||0)}:x):op))} placeholder="Precio unitario" className="sm:col-span-3 bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs"/><button onClick={()=>setOpcionesCotizacion(prev=>prev.map((op,i)=>i===oi?op.filter((_,j)=>j!==ii).length?op.filter((_,j)=>j!==ii):[{descripcion:'',cantidad:1,precio:0}]:op))} className="sm:col-span-1 text-rose-400 text-xs">✕</button><div className="sm:col-span-12 text-right text-xs text-slate-400">Subtotal: $ {(Number(it.cantidad||0)*Number(it.precio||0)).toLocaleString('es-CO')}</div></div>)}<div className="text-right text-emerald-300 font-black">Total opción: $ {items.reduce((sum,it)=>sum+Number(it.cantidad||0)*Number(it.precio||0),0).toLocaleString('es-CO')}</div></div>)}
                  {tipoCotizacion==='MULTIPLE' && <button onClick={()=>setOpcionesCotizacion(prev=>[...prev,[{descripcion:'',cantidad:1,precio:0}]])} className="border border-dashed border-indigo-500 text-indigo-300 rounded-xl p-3 w-full text-xs font-bold">+ Agregar otra opción a esta cotización</button>}
                </div>
                <div className="flex justify-end"><button disabled={guardandoCotizacion} onClick={async()=>{let cli=clienteCotSeleccionado;if(tipoClienteCot==='NUEVO'){if(!formNuevoClienteCot.nombre.trim()||!formNuevoClienteCot.telefono.trim()){alert('Ingresa nombre y teléfono del nuevo cliente.');return;}cli=await agregarCliente({nombre:formNuevoClienteCot.nombre.trim(),telefono:formNuevoClienteCot.telefono.trim(),cedula:formNuevoClienteCot.cedula.trim(),email:formNuevoClienteCot.email.trim(),direccion:formNuevoClienteCot.direccion.trim(),telefono_secundario:formNuevoClienteCot.telefono_secundario?.trim() || null});if(!cli)return;}if(!cli){alert('Selecciona un cliente o registra uno nuevo.');return;}const ops=(tipoCotizacion==='INDIVIDUAL' ? opcionesCotizacion.slice(0,1) : opcionesCotizacion).map((items,i)=>({nombre:`Opción ${i+1}`,items:items.filter(x=>x.descripcion.trim()).map(x=>({...x,cantidad:Number(x.cantidad)||1,precio:Number(x.precio)||0,subtotal:(Number(x.cantidad)||1)*(Number(x.precio)||0)})),total:items.filter(x=>x.descripcion.trim()).reduce((sum,x)=>sum+(Number(x.cantidad)||1)*(Number(x.precio)||0),0)}));if(ops.some(o=>!o.items.length)){alert('Cada opción debe tener al menos un producto o servicio con descripción.');return;}setGuardandoCotizacion(true);try{const maxNum=cotizaciones.reduce((m,c)=>Math.max(m,Number(String(c.numero_cotizacion||'').replace(/\D/g,''))||0),0);const numero=`COT-${String(maxNum+1).padStart(5,'0')}`;const nueva={numero_cotizacion:numero,cliente_id:cli.id,cliente_nombre:cli.nombre,cliente_telefono:cli.telefono,cliente_cedula:cli.cedula||'',cliente_email:cli.email||'',cliente_direccion:cli.direccion||'',tipo:tipoCotizacion,opciones:ops,vigencia:document.getElementById('vigenciaCotizacion')?.value||null,usuario_creador:usuarioSesion?.nombre||'Sistema',fecha:new Date().toISOString()};const {data,error}=await supabase.from('cotizaciones').insert([nueva]).select();if(error)throw error;setCotizaciones(prev=>[data[0],...prev]);setCotizacionActiva(data[0]);alert(`Cotización ${numero} guardada correctamente.`);}catch(err){console.error(err);alert('No se pudo guardar la cotización. Verifica que hayas creado la tabla cotizaciones en Supabase y sus permisos.');}finally{setGuardandoCotizacion(false);}}} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-5 py-3 rounded-xl text-xs font-black">{guardandoCotizacion?'Guardando...':'Guardar cotización'}</button></div>
              </div>
            ) : (
              <div className="bg-white text-slate-900 rounded-2xl p-8 max-w-4xl mx-auto space-y-5" id="documento-cotizacion">
                <div className="flex justify-between gap-4 border-b pb-4"><div>{empresa.logoUrl&&<img src={empresa.logoUrl} alt="Logo" className="w-20 h-20 object-contain"/>}<h2 className="text-2xl font-black">{empresa.nombre}</h2><p>{empresa.direccion} · {empresa.telefono}</p></div><div className="text-right"><h3 className="text-xl font-black">COTIZACIÓN</h3><p className="font-bold">{cotizacionActiva.numero_cotizacion}</p><p>{String(cotizacionActiva.fecha||'').slice(0,10)}</p><p>{cotizacionActiva.tipo==='MULTIPLE'?'Cotización múltiple':'Cotización individual'}</p></div></div>
                <div><p><b>Cliente:</b> {cotizacionActiva.cliente_nombre}</p><p><b>Teléfono:</b> {cotizacionActiva.cliente_telefono}</p>{cotizacionActiva.cliente_cedula&&<p><b>Cédula:</b> {cotizacionActiva.cliente_cedula}</p>}{cotizacionActiva.vigencia&&<p><b>Vigente hasta:</b> {cotizacionActiva.vigencia}</p>}</div>
                {(cotizacionActiva.opciones||[]).map((op,i)=><div key={i} className="border rounded-lg p-4"><h3 className="font-black text-lg mb-2">{cotizacionActiva.tipo==='MULTIPLE'?op.nombre:'Detalle de cotización'}</h3><table className="w-full text-sm border-collapse"><thead><tr className="bg-slate-100"><th className="text-left p-2 border">Descripción</th><th className="p-2 border">Cant.</th><th className="text-right p-2 border">Valor unitario</th><th className="text-right p-2 border">Subtotal</th></tr></thead><tbody>{(op.items||[]).map((it,j)=><tr key={j}><td className="p-2 border">{it.descripcion}</td><td className="p-2 border text-center">{it.cantidad}</td><td className="p-2 border text-right">$ {Number(it.precio).toLocaleString('es-CO')}</td><td className="p-2 border text-right">$ {Number(it.subtotal).toLocaleString('es-CO')}</td></tr>)}</tbody></table><p className="text-right font-black text-lg mt-3">Total: $ {Number(op.total||0).toLocaleString('es-CO')}</p></div>)}
                <div className="flex flex-wrap justify-end gap-2 no-imprimir"><button onClick={()=>setCotizacionActiva(null)} className="bg-slate-200 px-3 py-2 rounded-lg text-xs font-bold">Volver al historial</button><button onClick={()=>window.print()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Imprimir / Guardar PDF</button><button onClick={()=>{const tel=normalizarTelefonoWhatsApp(cotizacionActiva.cliente_telefono);if(!tel){alert('El cliente no tiene teléfono válido para WhatsApp.');return;}const resumen=(cotizacionActiva.opciones||[]).map((op,i)=>`${cotizacionActiva.tipo==='MULTIPLE'?op.nombre:'Total'}: $ ${Number(op.total||0).toLocaleString('es-CO')}`).join('\n');const msg=`Hola ${cotizacionActiva.cliente_nombre}, te compartimos la cotización ${cotizacionActiva.numero_cotizacion} de ${empresa.nombre}.\n${resumen}\nPuedes solicitar el documento completo por este medio.`;window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');}} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Enviar por WhatsApp</button></div>
              </div>
            )}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5"><h3 className="font-bold mb-3">Historial de cotizaciones</h3><div className="space-y-2">{cotizaciones.filter(c=>normalizarBusqueda(`${c.numero_cotizacion} ${c.cliente_nombre} ${c.cliente_telefono}`).includes(normalizarBusqueda(cotizacionesBusqueda))).map(c=><div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 rounded-xl p-3"><div><p className="font-bold text-sm">{c.numero_cotizacion} · {c.cliente_nombre}</p><p className="text-xs text-slate-400">{c.cliente_telefono} · {c.tipo==='MULTIPLE'?'Múltiple':'Individual'} · {String(c.fecha||c.created_at||'').slice(0,10)}</p></div><div className="flex items-center gap-2"><span className="text-emerald-300 font-bold text-xs">{(c.opciones||[]).length} opción(es)</span><button onClick={()=>setCotizacionActiva(c)} className="bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-lg text-xs">Ver / Imprimir</button></div></div>)}{cotizaciones.length===0&&<p className="text-xs text-slate-500">Aún no hay cotizaciones guardadas.</p>}</div></div>
          </div>
        )}

        {tab === 'compras' && permisos.facturar && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-4">
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <div>
                <h2 className="text-xl font-bold text-white">Compras y Gastos del Local</h2>
                <p className="text-xs text-slate-400">Registra repuestos e insumos comprados para usar o revender a clientes.</p>
              </div>
              <button onClick={() => { setModalCompra(true); setFormCompra({ proveedor: '', descripcion_producto: '', costo: 0, precio_venta_sugerido: '' }); }} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl text-xs font-bold transition">+ Registrar Compra</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-800/60 border border-slate-700 rounded-xl p-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Desde la fecha</label>
                <input type="date" value={comprasFiltroInicio} onChange={e => setComprasFiltroInicio(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-2 rounded-lg text-white text-xs" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Hasta la fecha</label>
                <input type="date" value={comprasFiltroFin} onChange={e => setComprasFiltroFin(e.target.value)} className="w-full bg-slate-900 border border-slate-700 p-2 rounded-lg text-white text-xs" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-400 mb-1">Buscar proveedor/tienda o producto comprado</label>
                <input type="text" value={comprasBusqueda} onChange={e => setComprasBusqueda(e.target.value)} placeholder="Nombre de tienda, proveedor o producto..." className="w-full bg-slate-900 border border-slate-700 p-2 rounded-lg text-white text-xs placeholder-slate-500" />
              </div>
              <div className="md:col-span-4 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">{compras.filter(c => {
                  const fecha = String(c.fecha || '').slice(0, 10);
                  const termino = normalizarBusqueda(comprasBusqueda);
                  const texto = normalizarBusqueda(`${c.proveedor || ''} ${c.descripcion_producto || ''}`);
                  if (comprasFiltroInicio && (!fecha || fecha < comprasFiltroInicio)) return false;
                  if (comprasFiltroFin && (!fecha || fecha > comprasFiltroFin)) return false;
                  return !termino || texto.includes(termino);
                }).length} compra(s) encontrada(s)</span>
                <button type="button" onClick={() => { setComprasFiltroInicio(''); setComprasFiltroFin(''); setComprasBusqueda(''); }} className="text-indigo-300 hover:text-white text-[11px] font-semibold">Limpiar filtros</button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400 uppercase"><tr><th className="p-3">Fecha</th><th className="p-3">Proveedor</th><th className="p-3">Producto / Repuesto</th><th className="p-3">Costo Invertido</th><th className="p-3">Precio Venta (editable)</th><th className="p-3">Registró</th></tr></thead>
                <tbody className="divide-y divide-slate-800">
                  {compras.filter(c => {
                    const fecha = String(c.fecha || '').slice(0, 10);
                    const termino = normalizarBusqueda(comprasBusqueda);
                    const texto = normalizarBusqueda(`${c.proveedor || ''} ${c.descripcion_producto || ''}`);
                    if (comprasFiltroInicio && (!fecha || fecha < comprasFiltroInicio)) return false;
                    if (comprasFiltroFin && (!fecha || fecha > comprasFiltroFin)) return false;
                    return !termino || texto.includes(termino);
                  }).map(c => (
                    <tr key={c.id} className="hover:bg-slate-800/40">
                      <td className="p-3 text-slate-400 whitespace-nowrap">{c.fecha}</td>
                      <td className="p-3 font-bold text-white">{c.proveedor}</td>
                      <td className="p-3 text-indigo-300">{c.descripcion_producto}</td>
                      <td className="p-3 font-bold text-rose-400 whitespace-nowrap">$ {(c.costo || 0).toLocaleString('es-CO')}</td>
                      <td className="p-3 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-400">$</span>
                          <input key={`${c.id}-${c.precio_venta_sugerido || 0}`} type="number" min="0" step="1" aria-label={`Precio de venta de ${c.descripcion_producto}`} defaultValue={c.precio_venta_sugerido ?? ''} placeholder="Sin definir" onBlur={async e => {
                            const valor = e.target.value.trim();
                            const actual = Number(c.precio_venta_sugerido) || 0;
                            const nuevo = valor === '' ? 0 : Number(valor);
                            if (!Number.isFinite(nuevo) || nuevo < 0) {
                              alert('Ingresa un precio de venta válido.');
                              e.target.value = actual;
                              return;
                            }
                            if (nuevo !== actual) {
                              const guardado = await actualizarPrecioCompra(c.id, nuevo);
                              if (!guardado) e.target.value = actual;
                            }
                          }} className="w-32 bg-slate-800 border border-slate-700 focus:border-emerald-500 p-2 rounded-lg text-emerald-300 font-bold" />
                        </div>
                        <span className="block text-[10px] text-slate-500 mt-1">Se guarda al salir del campo</span>
                      </td>
                      <td className="p-3 text-slate-400">{c.usuario_creador || 'Sistema'}</td>
                    </tr>
                  ))}
                  {compras.filter(c => {
                    const fecha = String(c.fecha || '').slice(0, 10);
                    const termino = normalizarBusqueda(comprasBusqueda);
                    const texto = normalizarBusqueda(`${c.proveedor || ''} ${c.descripcion_producto || ''}`);
                    if (comprasFiltroInicio && (!fecha || fecha < comprasFiltroInicio)) return false;
                    if (comprasFiltroFin && (!fecha || fecha > comprasFiltroFin)) return false;
                    return !termino || texto.includes(termino);
                  }).length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate-500">No hay compras que coincidan con la búsqueda.</td></tr>}
                </tbody>
              </table>
            </div>
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
                <p className="text-slate-300"><strong>Accesorios:</strong> {clienteSeleccionado.deja_cargador ? `🔌 Cargador (${clienteSeleccionado.serie_cargador || 'S/N no registrado'})` : 'Ninguno'}</p>
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
                        clienteSeleccionado.observaciones.filter(obs => !obs || obs._tipo !== 'garantia').map((obs, idx) => (
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
                
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
                  <label className="text-slate-200 font-bold block">📁 Carpeta predeterminada para guardar remisiones y órdenes PDF</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={seleccionarCarpetaPDF} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold">Elegir carpeta de Windows</button>
                    <span className="text-emerald-300 font-semibold">{nombreCarpetaPdf || 'Aún no has seleccionado una carpeta'}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">La carpeta queda recordada en este navegador y equipo. Chrome puede pedir autorización nuevamente si se revoca el permiso. Si no configuras una carpeta, el PDF se descargará en la ubicación predeterminada del navegador.</p>
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
                              checked={!!currentPerms.cancelar_remision}
                              onChange={e => {
                                const updated = { ...currentPerms, cancelar_remision: e.target.checked };
                                setRoles(roles.map(rol => rol.id === r.id ? { ...rol, permisos: updated } : rol));
                              }}
                            /> Cancelar remisiones
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
                  <label className="flex items-center gap-2"><input type="checkbox" checked={!!formNuevoRol.permisos.cancelar_remision} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, cancelar_remision: e.target.checked } })} /> Cancelar remisiones</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={formNuevoRol.permisos.ver_configuracion} onChange={e => setFormNuevoRol({ ...formNuevoRol, permisos: { ...formNuevoRol.permisos, ver_configuracion: e.target.checked } })} /> Configuración</label>
                </div>
                <button onClick={async () => { if (!formNuevoRol.nombre) return alert('Ingresa un nombre para el rol.'); await agregarRol(formNuevoRol.nombre, formNuevoRol.permisos); alert('Rol creado con éxito'); setFormNuevoRol({ nombre: '', permisos: { crear_orden: true, editar_diagnostico: true, ver_clientes: true, editar_clientes: true, facturar: true, cancelar_remision: false, ver_configuracion: true } }); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold">Guardar Nuevo Rol</button>

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
            <div className="space-y-1 border-b border-slate-700 pb-3">
              <h3 className="font-bold text-white text-base">{modalEditOrdenModo === 'editar' ? 'Editar datos de la Orden' : 'Diagnóstico de la Orden'} {obtenerIdRegistroOrden(modalEditOrden)}</h3>
              <p className="text-sm font-semibold text-indigo-300">Cliente: {modalEditOrden.cliente_nombre || 'Sin nombre registrado'}</p>
              <p className="text-xs text-slate-300">Equipo: {modalEditOrden.tipo_equipo || 'Equipo'} {modalEditOrden.marca_modelo || 'Marca/modelo no registrado'}</p>
            </div>

            {modalEditOrdenModo === 'editar' && (
            <div className="bg-indigo-950/30 p-3 rounded-xl border border-indigo-700/60 space-y-2">
              <p className="text-xs font-bold text-indigo-300">Corregir datos de ingreso (si hubo error de digitación)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={editOrdForm.clienteNombre || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteNombre: e.target.value })} placeholder="Nombre del cliente" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.clienteTelefono || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteTelefono: e.target.value })} placeholder="Teléfono principal" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.clienteTelefonoSecundario || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteTelefonoSecundario: e.target.value })} placeholder="Segundo teléfono (opcional)" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white sm:col-span-2" />
                <input value={editOrdForm.clienteCedula || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteCedula: e.target.value })} placeholder="Cédula del cliente" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.clienteEmail || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteEmail: e.target.value })} placeholder="Correo del cliente" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.clienteDireccion || ''} onChange={e => setEditOrdForm({ ...editOrdForm, clienteDireccion: e.target.value })} placeholder="Dirección del cliente" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white sm:col-span-2" />
                <input value={editOrdForm.tipoEquipo || ''} onChange={e => setEditOrdForm({ ...editOrdForm, tipoEquipo: e.target.value })} placeholder="Tipo de equipo" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.marcaModelo || ''} onChange={e => setEditOrdForm({ ...editOrdForm, marcaModelo: e.target.value })} placeholder="Marca / modelo" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <input value={editOrdForm.serie || ''} onChange={e => setEditOrdForm({ ...editOrdForm, serie: e.target.value })} placeholder="Número de serie" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" />
                <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={!!editOrdForm.dejaCargador} onChange={e => setEditOrdForm({ ...editOrdForm, dejaCargador: e.target.checked, serieCargador: e.target.checked ? (editOrdForm.serieCargador || '') : '' })} /> Deja cargador</label>
                {editOrdForm.dejaCargador && <input value={editOrdForm.serieCargador || ''} onChange={e => setEditOrdForm({ ...editOrdForm, serieCargador: e.target.value })} placeholder="Serie del cargador" className="bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white sm:col-span-2" />}
                <div className="sm:col-span-2"><label className="text-[11px] text-amber-300 block mb-1">Fallo reportado al ingresar</label><textarea value={editOrdForm.falloReportado || ''} onChange={e => setEditOrdForm({ ...editOrdForm, falloReportado: e.target.value })} rows={3} className="w-full bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white" /></div>
              </div>
              <p className="text-[10px] text-slate-400">Estos cambios actualizan la orden. Si el cliente coincide con un registro del directorio por nombre y teléfono originales, también se corregirá su ficha.</p>
            </div>
            )}
            
            {modalEditOrdenModo === 'diagnostico' && (<>
            <div className="bg-amber-950/30 p-3 rounded-xl border border-amber-800/60 space-y-1 text-xs">
              <p className="font-bold text-amber-300">Falla reportada al ingresar el equipo:</p>
              <p className="text-slate-100 whitespace-pre-wrap">{modalEditOrden.fallo_reportado || modalEditOrden.falla_reportado || 'No se registró una falla inicial.'}</p>
            </div>
            <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 max-h-36 overflow-y-auto space-y-1 text-xs">
              <p className="font-bold text-indigo-400">Historial de Avances Anteriores:</p>
              {(Array.isArray(modalEditOrden.observaciones) ? modalEditOrden.observaciones.filter(obs => !obs || obs._tipo !== 'garantia') : []).length > 0 ? (
                modalEditOrden.observaciones.filter(obs => !obs || obs._tipo !== 'garantia').map((obs, idx) => (
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
                <option value="No tiene reparación">No tiene reparación</option>
                <option value="En Diagnóstico">En Diagnóstico</option>
                <option value="Esperando Repuesto">Esperando Repuesto</option>
                <option value="Reparado / Listo">Reparado / Listo</option>
                <option value="Entregado / Remisionado">Entregado / Remisionado</option>
              </select>
            </div>

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!editOrdForm.garantiaAplica} onChange={e => setEditOrdForm({ ...editOrdForm, garantiaAplica: e.target.checked, garantiaTiempo: e.target.checked ? (editOrdForm.garantiaTiempo || '') : '' })} />
                ✓ ¿Esta reparación tiene garantía?
              </label>
              {editOrdForm.garantiaAplica && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tiempo de garantía</label>
                  <input value={editOrdForm.garantiaTiempo || ''} onChange={e => setEditOrdForm({ ...editOrdForm, garantiaTiempo: e.target.value })} placeholder="Ej. 30 días, 3 meses, 1 año" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" />
                </div>
              )}
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

            </>)}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalEditOrden(null)} className="text-xs text-slate-400 px-3">Cancelar</button>
              <button onClick={async () => {
                if (modalEditOrdenModo === 'editar') {
                  if (!String(editOrdForm.clienteNombre || '').trim() || !String(editOrdForm.clienteTelefono || '').trim()) return alert('El nombre y el teléfono principal del cliente son obligatorios.');
                  const datosCorreccion = { cliente_nombre: String(editOrdForm.clienteNombre).trim(), cliente_telefono: String(editOrdForm.clienteTelefono).trim(), cliente_email: String(editOrdForm.clienteEmail || '').trim(), tipo_equipo: String(editOrdForm.tipoEquipo || '').trim(), marca_modelo: String(editOrdForm.marcaModelo || '').trim(), serie: String(editOrdForm.serie || '').trim(), deja_cargador: !!editOrdForm.dejaCargador, serie_cargador: editOrdForm.dejaCargador ? String(editOrdForm.serieCargador || '').trim() : '', fallo_reportado: String(editOrdForm.falloReportado || '').trim() };
                  const clienteOriginal = clientes.find(c => (modalEditOrden.cliente_id && String(c.id) === String(modalEditOrden.cliente_id)) || (normalizarBusqueda(c.nombre) === normalizarBusqueda(modalEditOrden.cliente_nombre) && String(c.telefono || '') === String(modalEditOrden.cliente_telefono || '')));
                  const ordenActualizada = await actualizarOrden(modalEditOrden.id, modalEditOrden.estado, '', modalEditOrden.diagnostico, modalEditOrden.valor_estimado, modalEditOrden.total_pagar, modalEditOrden.repuesto_compra_id, null, undefined, undefined, datosCorreccion);
                  if (!ordenActualizada) return;
                  if (clienteOriginal) {
                    const clienteActualizado = await modificarCliente(clienteOriginal.id, { nombre: datosCorreccion.cliente_nombre, telefono: datosCorreccion.cliente_telefono, telefono_secundario: String(editOrdForm.clienteTelefonoSecundario || '').trim() || null, cedula: String(editOrdForm.clienteCedula || '').trim(), email: String(editOrdForm.clienteEmail || '').trim(), direccion: String(editOrdForm.clienteDireccion || '').trim() });
                    if (clienteActualizado === false) return;
                  }
                  alert('Datos de ingreso corregidos correctamente.');
                } else {
                  if (editOrdForm.garantiaAplica && !String(editOrdForm.garantiaTiempo || '').trim()) return alert('Escribe el tiempo de garantía o desmarca la casilla.');
                  const ordenActualizada = await actualizarOrden(modalEditOrden.id, editOrdForm.estado, editOrdForm.observacion, editOrdForm.diagnostico, editOrdForm.presupuesto, editOrdForm.totalPagar, editOrdForm.repuestoCompraId, null, editOrdForm.garantiaAplica, editOrdForm.garantiaTiempo);
                  if (!ordenActualizada) return;
                  alert('Diagnóstico actualizado correctamente.');
                }
                setModalEditOrden(null);
              }} className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl text-xs font-bold">{modalEditOrdenModo === 'editar' ? 'Guardar Correcciones' : 'Guardar Diagnóstico'}</button>
            </div>
          </div>
        </div>
      )}

      {modalEditCliente && (
        <div className="fixed inset-0 bg-slate-950/80 flex items-center justify-center p-4 z-50 no-imprimir">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md p-6 rounded-2xl space-y-3">
            <h3 className="font-bold text-white text-base">{modalEditCliente.id ? 'Modificar Cliente' : 'Nuevo Cliente'}</h3>
            <input placeholder="Nombre *" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.nombre} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, nombre: e.target.value })} />
            <div className="flex gap-1"><input placeholder="Teléfono *" className="min-w-0 flex-1 bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.telefono} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono: e.target.value })} /><button type="button" title="Agregar segundo teléfono" onClick={() => setMostrarTelefonoSecundario(v => !v)} className="bg-indigo-600 text-white rounded-xl px-3 font-black">{mostrarTelefonoSecundario ? '−' : '+'}</button></div>
            {mostrarTelefonoSecundario && <input placeholder="Segundo teléfono (opcional)" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" value={formNuevoCliente.telefono_secundario || ''} onChange={e => setFormNuevoCliente({ ...formNuevoCliente, telefono_secundario: e.target.value })} />}
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
                    <p className="text-slate-400">Accesorios: {o.deja_cargador ? `🔌 Cargador (${o.serie_cargador || 'S/N no registrado'})` : 'Ninguno'}</p>
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
                    <div className="flex gap-1"><input placeholder="Teléfono / WhatsApp *" className="min-w-0 flex-1 bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.telefono} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, telefono: e.target.value })} /><button type="button" title="Agregar segundo teléfono" onClick={() => setMostrarTelefonoSecundario(v => !v)} className="bg-indigo-600 text-white rounded-xl px-3 font-black">{mostrarTelefonoSecundario ? '−' : '+'}</button></div>
                    <input placeholder="Cédula" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.cedula} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, cedula: e.target.value })} />
                  </div>
                  {mostrarTelefonoSecundario && <input placeholder="Segundo teléfono (opcional)" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-white" value={formNuevoClienteVenta.telefono_secundario || ''} onChange={e => setFormNuevoClienteVenta({ ...formNuevoClienteVenta, telefono_secundario: e.target.value })} />}
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

            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={garantiaVentaAplica} onChange={e => { setGarantiaVentaAplica(e.target.checked); if (!e.target.checked) setGarantiaVentaTiempo(''); }} />
                ✓ ¿Esta venta tiene garantía?
              </label>
              {garantiaVentaAplica && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tiempo de garantía</label>
                  <input value={garantiaVentaTiempo} onChange={e => setGarantiaVentaTiempo(e.target.value)} placeholder="Ej. 30 días, 3 meses, 1 año" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" />
                </div>
              )}
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

                if (garantiaVentaAplica && !String(garantiaVentaTiempo || '').trim()) return alert('Escribe el tiempo de garantía o desmarca la casilla.');
                const total = itemsVenta.reduce((acc, i) => acc + (i.cantidad * i.precio), 0);
                if (total <= 0) return alert('Ingresa ítems con precio mayor a 0');

                let costoCompraTotal = 0;
                if (compraSeleccionadaVentaId) {
                  const compAsociada = compras.find(c => c.id.toString() === compraSeleccionadaVentaId);
                  if (compAsociada) costoCompraTotal = Number(compAsociada.costo) || 0;
                }
                
                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                const fac = await agregarVentaDirecta(clienteFinalObj, itemsVenta, total, costoCompraTotal, nombreUsrActual, garantiaVentaAplica, garantiaVentaTiempo);
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
            
            <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-emerald-400 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-emerald-600" checked={!!modalRemisionarOrden.garantiaAplica} onChange={e => setModalRemisionarOrden({ ...modalRemisionarOrden, garantiaAplica: e.target.checked, garantiaTiempo: e.target.checked ? (modalRemisionarOrden.garantiaTiempo || '') : '' })} />
                ✓ ¿La remisión tiene garantía?
              </label>
              {modalRemisionarOrden.garantiaAplica && (
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tiempo de garantía</label>
                  <input value={modalRemisionarOrden.garantiaTiempo || ''} onChange={e => setModalRemisionarOrden({ ...modalRemisionarOrden, garantiaTiempo: e.target.value })} placeholder="Ej. 30 días, 3 meses, 1 año" className="w-full bg-slate-800 border border-slate-700 p-2 rounded-xl text-xs text-white" />
                </div>
              )}
            </div>

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
                if (modalRemisionarOrden.garantiaAplica && !String(modalRemisionarOrden.garantiaTiempo || '').trim()) return alert('Escribe el tiempo de garantía o desmarca la casilla.');
                const nombreUsrActual = usuarioSesion ? usuarioSesion.nombre : 'Admin';
                let itemCompraObj = null;
                if (modalRemisionarOrden.compraId) {
                  itemCompraObj = compras.find(c => c.id.toString() === modalRemisionarOrden.compraId.toString());
                }

                const fac = await remisionarOrden(modalRemisionarOrden.orden, nombreUsrActual, itemCompraObj, modalRemisionarOrden.garantiaAplica, modalRemisionarOrden.garantiaTiempo);
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
                  <label className="text-slate-400 block mb-1">Precio Venta (opcional, editable después) ($)</label>
                  <input type="number" min="0" step="1" placeholder="Puedes dejarlo vacío" className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-xl text-white font-bold text-emerald-400" value={formCompra.precio_venta_sugerido} onChange={e => setFormCompra({...formCompra, precio_venta_sugerido: e.target.value})} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3">
              <button onClick={() => setModalCompra(false)} className="text-xs text-slate-400 px-3 py-1">Cancelar</button>
              <button onClick={async () => {
                if(!formCompra.proveedor.trim() || !formCompra.descripcion_producto.trim() || Number(formCompra.costo) <= 0) {
                  return alert('Por favor completa el proveedor, producto y un costo válido. El precio de venta es opcional.');
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

      {modalCancelarRemision && (
        <div className="fixed inset-0 bg-slate-950/85 flex items-center justify-center p-4 z-[70] no-imprimir">
          <div className="bg-slate-900 border border-rose-800/70 w-full max-w-md p-6 rounded-2xl space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="bg-rose-950 text-rose-300 rounded-xl p-3 text-xl">⛔</div>
              <div>
                <h3 className="font-black text-white text-lg">Cancelar remisión {modalCancelarRemision.factura.numero_factura}</h3>
                <p className="text-xs text-slate-400 mt-1">Cliente: {modalCancelarRemision.factura.cliente_nombre}</p>
              </div>
            </div>
            <div className="bg-amber-950/40 border border-amber-700/60 p-3 rounded-xl text-xs text-amber-200">
              La remisión no se eliminará. Quedará marcada como cancelada y se guardarán el usuario, la fecha y el motivo en su historial.
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">Motivo de cancelación (obligatorio)</label>
              <textarea
                value={modalCancelarRemision.motivo}
                onChange={e => setModalCancelarRemision({ ...modalCancelarRemision, motivo: e.target.value })}
                placeholder="Ej. Precio incorrecto, datos equivocados, remisión duplicada..."
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 focus:border-rose-500 p-3 rounded-xl text-sm text-white outline-none resize-y"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalCancelarRemision(null)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 hover:bg-slate-800">Volver</button>
              <button
                onClick={async () => {
                  const motivo = String(modalCancelarRemision.motivo || '').trim();
                  if (!motivo) return alert('Escribe el motivo de la cancelación.');
                  const usuarioQueCancela = usuarioSesion?.nombre || 'Usuario';
                  const resultado = await cancelarRemision(modalCancelarRemision.factura, motivo, usuarioQueCancela);
                  if (resultado) {
                    setModalCancelarRemision(null);
                    if (facturaSeleccionada?.id === resultado.id) setFacturaSeleccionada(resultado);
                    if (documentoImprimir?.data?.id === resultado.id) setDocumentoImprimir({ ...documentoImprimir, data: resultado });
                    alert(`La remisión ${resultado.numero_factura} quedó cancelada y registrada en su historial.`);
                  }
                }}
                className="bg-rose-700 hover:bg-rose-600 text-white px-4 py-2 rounded-xl text-xs font-black"
              >Confirmar cancelación</button>
            </div>
          </div>
        </div>
      )}

      {modalEditarRemision && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-[80] no-imprimir">
          <div className="bg-slate-900 border border-amber-700/60 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl space-y-4 shadow-2xl">
            <div>
              <h3 className="text-lg font-black text-white">Modificar remisión {modalEditarRemision.factura.numero_factura}</h3>
              <p className="text-xs text-amber-300 mt-1">Cambio excepcional. Se conservará un historial interno de la modificación.</p>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center"><label className="text-xs font-bold text-slate-300">Ítems de la remisión</label><button onClick={() => setModalEditarRemision(p => ({...p,items:[...p.items,{descripcion:'',cantidad:1,precio:0}]}))} className="text-xs text-cyan-300 font-bold">+ Agregar ítem</button></div>
              {modalEditarRemision.items.map((it,i) => <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input value={it.descripcion} onChange={e=>setModalEditarRemision(p=>({...p,items:p.items.map((x,j)=>j===i?{...x,descripcion:e.target.value}:x)}))} placeholder="Descripción" className="col-span-6 bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white"/>
                <input type="number" min="1" value={it.cantidad} onChange={e=>setModalEditarRemision(p=>({...p,items:p.items.map((x,j)=>j===i?{...x,cantidad:Math.max(1,Number(e.target.value)||1)}:x)}))} className="col-span-2 bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white"/>
                <input type="number" min="0" value={it.precio} onChange={e=>setModalEditarRemision(p=>({...p,items:p.items.map((x,j)=>j===i?{...x,precio:Math.max(0,Number(e.target.value)||0)}:x)}))} className="col-span-3 bg-slate-800 border border-slate-700 p-2 rounded-lg text-xs text-white"/>
                <button onClick={()=>setModalEditarRemision(p=>({...p,items:p.items.filter((_,j)=>j!==i)}))} className="col-span-1 text-rose-400">✕</button>
              </div>)}
              <label className="block text-xs text-slate-300">Costo asociado (para cálculo de utilidad)</label>
              <input type="number" min="0" value={modalEditarRemision.costo} onChange={e=>setModalEditarRemision(p=>({...p,costo:Math.max(0,Number(e.target.value)||0)}))} className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs text-white"/>
              <p className="text-right text-sm font-black text-emerald-300">Nuevo total: {formatoCOP(modalEditarRemision.items.reduce((sum,it)=>sum+(Number(it.cantidad)||0)*(Number(it.precio)||0),0))}</p>
            </div>
            <div className="border-t border-slate-700 pt-3 space-y-3">
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Contraseña del usuario que autoriza</label><input type="password" value={modalEditarRemision.password} onChange={e=>setModalEditarRemision(p=>({...p,password:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs text-white" placeholder="Confirma tu contraseña"/></div>
              <div><label className="block text-xs font-bold text-slate-300 mb-1">Motivo interno del cambio (obligatorio)</label><textarea rows={3} value={modalEditarRemision.motivo} onChange={e=>setModalEditarRemision(p=>({...p,motivo:e.target.value}))} className="w-full bg-slate-800 border border-slate-700 p-2.5 rounded-lg text-xs text-white" placeholder="Explica por qué se modifica esta remisión. No se imprime."/></div>
            </div>
            <div className="flex justify-end gap-2"><button onClick={()=>setModalEditarRemision(null)} className="px-4 py-2 rounded-xl text-xs text-slate-300">Cancelar</button><button onClick={async()=>{
              const m=modalEditarRemision; const motivo=String(m.motivo||'').trim();
              if(!m.password) return alert('Ingresa la contraseña para autorizar el cambio.');
              if(!motivo) return alert('El motivo interno es obligatorio.');
              const usuarioValido=usuarios.find(u=>String(u.usuario||'').toLowerCase()===String(usuarioSesion?.usuario||'').toLowerCase() && u.clave===m.password);
              const emergenciaValida=usuarioSesion?.id==='emergencia' && m.password==='admin123' && usuarios.length===0;
              if(!usuarioValido && !emergenciaValida) return alert('Contraseña incorrecta. No se realizaron cambios.');
              if(!m.items.length || m.items.some(it=>!it.descripcion.trim())) return alert('Debe existir al menos un ítem y todos deben tener descripción.');
              const itemsPrevios=(Array.isArray(m.factura.items)?m.factura.items:[]).filter(it=>it && it._tipo);
              const itemsNuevos=[...m.items, ...itemsPrevios, { _tipo:'auditoria_edicion', motivo, usuario:usuarioSesion?.nombre||'Usuario', fecha:new Date().toISOString(), total_anterior:Number(m.factura.total)||0, costo_anterior:Number(m.factura.costo_compra)||0 }];
              const total= m.items.reduce((sum,it)=>sum+(Number(it.cantidad)||0)*(Number(it.precio)||0),0);
              const {data,error}=await supabase.from('facturas').update({items:itemsNuevos,total,costo_compra:Number(m.costo)||0}).eq('id',m.factura.id).select().single();
              if(error||!data){console.error(error);return alert('No se pudo guardar la modificación: '+(error?.message||'Error de Supabase'));}
              // Recargar la lista completa para reflejar también cualquier dato calculado/actualizado en Supabase.
              const { data: facturasActualizadas, error: errorRecarga } = await supabase
                .from('facturas').select('*').order('id', { ascending: false });
              if (errorRecarga) {
                console.error('La remisión se guardó, pero no se pudo recargar la lista:', errorRecarga);
                setFacturas(prev => prev.map(f => f.id === data.id ? data : f));
              } else if (facturasActualizadas) {
                setFacturas(facturasActualizadas);
              }
              setModalEditarRemision(null);
              setFacturaSeleccionada(null);
              // El modal se desmonta y la lista queda visible en la misma posición.
              requestAnimationFrame(() => {
                window.scrollTo({ top: scrollRemisionAntesEditar, behavior: 'auto' });
                alert('¡Cambio realizado con éxito! La remisión fue actualizada.');
                requestAnimationFrame(() => window.scrollTo({ top: scrollRemisionAntesEditar, behavior: 'auto' }));
              });
            }} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded-xl text-xs font-black text-white">Validar y guardar cambios</button></div>
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
            {facturaEstaCancelada(facturaSeleccionada) && (() => {
              const cancelacion = obtenerCancelacionFactura(facturaSeleccionada);
              return (
                <div className="bg-rose-950/50 border border-rose-700 rounded-xl p-3 space-y-1">
                  <p className="text-rose-300 font-black text-sm">⛔ REMISIÓN CANCELADA</p>
                  <p className="text-xs text-slate-200"><strong>Motivo:</strong> {cancelacion.motivo}</p>
                  <p className="text-xs text-slate-400"><strong>Cancelada por:</strong> {cancelacion.usuario || 'Usuario'}</p>
                  <p className="text-xs text-slate-400"><strong>Fecha y hora:</strong> {cancelacion.fecha ? new Date(cancelacion.fecha).toLocaleString('es-CO') : 'No registrada'}</p>
                </div>
              );
            })()}

            <div className="border border-slate-800 rounded-xl overflow-hidden max-h-40 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-800 text-slate-400">
                  <tr><th className="p-2">Ítem / Descripción</th><th className="p-2 text-center">Cant.</th><th className="p-2 text-right">Precio</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(facturaSeleccionada.items || []).filter(it => it && !it._tipo).map((it, idx) => (
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

            { !facturaEstaCancelada(facturaSeleccionada) && (
              <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3 text-[11px] text-amber-200">
                Si necesitas corregir una remisión ya emitida, el sistema solicitará contraseña y motivo. El motivo quedará como registro interno y no aparecerá en el documento del cliente.
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {!facturaEstaCancelada(facturaSeleccionada) && <button onClick={() => {
                setScrollRemisionAntesEditar(window.scrollY || window.pageYOffset || 0);
                const items = (facturaSeleccionada.items || []).filter(it => it && !it._tipo);
                setModalEditarRemision({ factura: facturaSeleccionada, items: items.map(it => ({ descripcion: it.descripcion || '', cantidad: Number(it.cantidad) || 1, precio: Number(it.precio) || 0 })), costo: Number(facturaSeleccionada.costo_compra) || 0, password: '', motivo: '' });
                setFacturaSeleccionada(null);
              }} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold">✏️ Modificar remisión</button>}
              <button onClick={() => setFacturaSeleccionada(null)} className="bg-slate-800 text-white px-4 py-1.5 rounded-xl text-xs font-bold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {documentoImprimir && (
        <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 w-full max-w-xl p-5 rounded-2xl space-y-2 shadow-2xl h-[50vh] max-h-[50vh] overflow-y-auto flex flex-col justify-between border-b-2 border-dashed border-slate-400">
            <div id="seccion-impresion" className="space-y-2 text-[17px]">
              {documentoImprimir.tipo === 'FACTURA' && facturaEstaCancelada(documentoImprimir.data) && (
                <div className="border-4 border-rose-700 text-rose-700 text-center font-black text-xl p-2">DOCUMENTO CANCELADO — NO VÁLIDO PARA COBRO</div>
              )}
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
                  <p><strong>Accesorios:</strong> {documentoImprimir.data.deja_cargador ? `🔌 Cargador (${documentoImprimir.data.serie_cargador || 'S/N no registrado'})` : 'Ninguno'}</p>
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

              {documentoImprimir.tipo === 'ORDEN' && obtenerGarantiaOrden(documentoImprimir.data).aplica && (
                <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300 text-sm">
                  <p><strong>Garantía:</strong> {obtenerGarantiaOrden(documentoImprimir.data).tiempo || 'Tiempo no especificado'}</p>
                  <p className="text-[10px] leading-tight mt-1">{CONDICIONES_GARANTIA}</p>
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
                      {(documentoImprimir.data.items || []).filter(it => it && !it._tipo).map((it, idx) => (
                        <tr key={idx}><td className="p-1.5 border">{it.descripcion}</td><td className="p-1.5 text-center border">{it.cantidad}</td><td className="p-1.5 text-right border">$ {(it.precio || 0).toLocaleString('es-CO')}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="font-black text-emerald-700 text-xl text-right mt-1">Total a Pagar: $ {(documentoImprimir.data.total || 0).toLocaleString('es-CO')}</p>

                  {(() => {
                    const garantia = obtenerGarantiaFactura(documentoImprimir.data);
                    return (
                      <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300 text-sm">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="border border-slate-300 p-2 rounded min-h-14 flex flex-col justify-between">
                            <span className="font-bold text-slate-600 uppercase text-xs">Garantía:</span>
                            <span className="font-bold">{garantia.aplica ? (garantia.tiempo || 'Tiempo no especificado') : 'No aplica'}</span>
                          </div>
                          <div className="border border-slate-300 p-2 rounded min-h-14 flex flex-col items-center justify-end text-center">
                            <span className="text-xs text-slate-400 font-bold uppercase">Sello / Firma</span>
                          </div>
                        </div>
                        {garantia.aplica && <p className="text-[10px] leading-tight mt-2">{CONDICIONES_GARANTIA}</p>}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t no-imprimir">
              <button onClick={() => setDocumentoImprimir(null)} className="text-slate-500 px-3 text-xs">Cerrar</button>
              <button
                onClick={async () => {
                  const doc = documentoImprimir.data;
                  const tel = normalizarTelefonoWhatsApp(doc.cliente_telefono);
                  if (!tel) { alert('El cliente no tiene un teléfono válido para WhatsApp. Revisa sus datos antes de enviar.'); return; }

                  const nombreClienteLimpio = (doc.cliente_nombre || 'Cliente')
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
                  const consecutivo = documentoImprimir.tipo === 'FACTURA'
                    ? (doc.numero_factura || 'SinNumero')
                    : (documentoImprimir.idConsecutivo || doc.codigo_seguimiento || 'SinNumero');
                  const nombreArchivo = `${documentoImprimir.tipo === 'FACTURA' ? 'Remision' : 'Orden'}_${consecutivo}_${nombreClienteLimpio || 'Cliente'}.pdf`;
                  const waWindow = window.open('about:blank', '_blank');

                  try {
                    const elemento = document.getElementById('seccion-impresion');
                    if (!elemento) throw new Error('No se encontró el documento para convertir a PDF.');
                    const canvas = await html2canvas(elemento, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
                    const imagen = canvas.toDataURL('image/png');
                    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
                    const anchoPagina = pdf.internal.pageSize.getWidth();
                    const altoPagina = pdf.internal.pageSize.getHeight();
                    const altoImagen = canvas.height * anchoPagina / canvas.width;
                    let altoPendiente = altoImagen;
                    let posicion = 0;
                    pdf.addImage(imagen, 'PNG', 0, posicion, anchoPagina, altoImagen, undefined, 'FAST');
                    altoPendiente -= altoPagina;
                    while (altoPendiente > 0) {
                      posicion = altoPendiente - altoImagen;
                      pdf.addPage();
                      pdf.addImage(imagen, 'PNG', 0, posicion, anchoPagina, altoImagen, undefined, 'FAST');
                      altoPendiente -= altoPagina;
                    }
                    const blobPdf = pdf.output('blob');
                    let guardadoEnCarpeta = false;

                    if (carpetaPdfHandle) {
                      try {
                        let permiso = await carpetaPdfHandle.queryPermission({ mode: 'readwrite' });
                        if (permiso !== 'granted') permiso = await carpetaPdfHandle.requestPermission({ mode: 'readwrite' });
                        if (permiso === 'granted') {
                          const archivo = await carpetaPdfHandle.getFileHandle(nombreArchivo, { create: true });
                          const writable = await archivo.createWritable();
                          await writable.write(blobPdf);
                          await writable.close();
                          guardadoEnCarpeta = true;
                        }
                      } catch (errorCarpeta) { console.warn('No se pudo guardar en la carpeta seleccionada:', errorCarpeta); }
                    }

                    if (!guardadoEnCarpeta) pdf.save(nombreArchivo);
                    let msg = documentoImprimir.tipo === 'FACTURA'
                      ? `Hola *${doc.cliente_nombre}* 👋\n\nTe compartimos la remisión *${doc.numero_factura}* de *${empresa.nombre}*. Adjuntamos el documento en PDF.`
                      : `Hola *${doc.cliente_nombre}* 👋\n\nTe compartimos la orden de entrada *${consecutivo}* de *${empresa.nombre}*. Adjuntamos el documento en PDF.`;
                    const urlWhatsApp = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
                    if (waWindow && !waWindow.closed) waWindow.location.href = urlWhatsApp;
                    else window.open(urlWhatsApp, '_blank', 'noopener,noreferrer');
                    if (guardadoEnCarpeta) alert(`PDF guardado correctamente en "${nombreCarpetaPdf || carpetaPdfHandle.name}". Ahora adjúntalo en la conversación de WhatsApp.`);
                    else alert('El PDF se generó y se descargó. Adjunta el archivo descargado en la conversación de WhatsApp.');
                  } catch (error) {
  console.error('Error detallado generando PDF:', error);

  if (waWindow && !waWindow.closed) {
    waWindow.close();
  }

  alert(
    'Error al generar el PDF:\n\n' +
    (error?.message || 'Error desconocido') +
    '\n\nRevisa la consola del navegador para más detalles.'
  );
}
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1"
                title="Genera un PDF con el nombre del cliente, lo guarda en la carpeta configurada y abre WhatsApp"
              >
                💬 Generar PDF y abrir WhatsApp
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
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 text-slate-100 font-sans">
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
            <p className="text-slate-300"><strong>Accesorios:</strong> {ordenConsultaResult.deja_cargador ? `🔌 Cargador (${ordenConsultaResult.serie_cargador || 'S/N no registrado'})` : 'Ninguno'}</p>
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
                  {(Array.isArray(ordenConsultaResult.observaciones) ? ordenConsultaResult.observaciones.filter(obs => !obs || obs._tipo !== 'garantia') : []).length > 0 ? (
                    ordenConsultaResult.observaciones.filter(obs => !obs || obs._tipo !== 'garantia').map((obs, idx) => (
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
      <div
        style={{
          position: "relative",
          isolation: "isolate",
          minHeight: "100vh",
        }}
      >
        <InteractiveBackground />
        <div style={{ position: "relative", zIndex: 1 }}>
          <AppContent />
        </div>
      </div>
    </AppProvider>
  );
}
