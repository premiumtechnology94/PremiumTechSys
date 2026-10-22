import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Search } from 'lucide-react';

export default function PortalCliente() {
  const [codigo, setCodigo] = useState('');
  const [resultado, setResultado] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const consultarOrden = async (e) => {
    e.preventDefault();
    if (!codigo.trim()) return;

    setCargando(true);
    setError('');
    setResultado(null);

    try {
      const { data, error } = await supabase
        .from('ordenes')
        .select(`*, clientes(nombre)`)
        .ilike('codigo_seguimiento', codigo.trim())
        .single();

      if (error || !data) {
        setError('No se encontró ninguna orden con ese código. Verifica e intenta de nuevo.');
      } else {
        setResultado(data);
      }
    } catch (err) {
      setError('Error al conectar con la base de datos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-6 text-center">
        
        <div className="space-y-2">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-white text-3xl mx-auto shadow-lg shadow-indigo-600/30">TF</div>
          <h1 className="text-2xl font-bold text-white">TechFix Soluciones</h1>
          <p className="text-sm text-slate-400">Consulta el estado de tu reparación</p>
        </div>

        <form onSubmit={consultarOrden} className="flex gap-2">
          <input
            type="text"
            placeholder="Ingresa tu código de seguimiento (ej. TK-89A1)"
            className="flex-1 bg-slate-800 border border-slate-700 p-3 rounded-xl text-white text-center font-bold font-mono uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            required
          />
          <button 
            type="submit" 
            disabled={cargando}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 rounded-xl font-bold transition flex items-center gap-2 disabled:opacity-50"
          >
            <Search size={18} /> {cargando ? 'Buscando...' : 'Consultar'}
          </button>
        </form>

        {error && <p className="text-sm text-rose-400 font-medium bg-rose-950/30 p-3 rounded-xl">{error}</p>}

        {resultado && (
          <div className="text-left bg-slate-800/60 p-5 rounded-xl border border-slate-700 space-y-3 text-sm">
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <span className="font-bold text-indigo-400 text-lg">Estado: {resultado.estado}</span>
              <span className="font-mono text-xs text-amber-400 bg-amber-950/50 px-2 py-1 rounded border border-amber-800/50">
                {resultado.codigo_seguimiento}
              </span>
            </div>
            <p><strong className="text-white">Cliente:</strong> {resultado.clientes?.nombre || 'Desconocido'}</p>
            <p><strong className="text-white">Equipo:</strong> {resultado.tipo_equipo} {resultado.marca_modelo}</p>
            <p><strong className="text-white">Diagnóstico Técnico:</strong> {resultado.diagnostico || 'Equipo en proceso de revisión.'}</p>
            <div className="pt-2 border-t border-slate-700/60 flex justify-between items-center">
              <span className="text-slate-400">Presupuesto Estimado:</span>
              <span className="font-black text-emerald-400 text-lg">$ {Number(resultado.valor_estimado || 0).toLocaleString('es-CO')}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}