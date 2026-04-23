import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchInitialData, saveRecord } from './services/api';

function App() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ responsables: [], conceptos: [], miembros: [], categoriasLista: [] });
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef(null);
  
  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    responsable: "",
    miembro: "",
    correo: "",
    concepto: "",
    esCuota: "",
    valor: "",
    formaDePago: "Efectivo",
    observaciones: "",
    codigo: "",
    enviarCorreo: true,
    radioFila: "1",
    cat2: ""
  });

  const [memberDetails, setMemberDetails] = useState({
    categoria: "-",
    cuota: 0,
    saldo: 0,
    pendientes: 0
  });

  const [memberDetails2, setMemberDetails2] = useState({
    cuota: 0,
    saldo: 0,
    pendientes: 0
  });

  useEffect(() => {
    const init = async () => {
      try {
        const result = await fetchInitialData();
        setData(result);
      } catch (e) {
        alert("Error cargando datos. Verifique la URL de GAS y el Token.");
      } finally {
        setLoading(false);
      }
    };
    init();

    const handleClickOutside = (event) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredMiembros = useMemo(() => {
    if (!search) return [];
    return data.miembros.filter(m => 
      m.nombre.toLowerCase().includes(search.toLowerCase())
    ).slice(0, 10);
  }, [search, data.miembros]);

  const handleSelectMember = (nombre) => {
    setSearch(nombre);
    setShowSuggestions(false);
    const m = data.miembros.find(x => x.nombre === nombre);
    if (m) {
      setFormData(prev => ({ ...prev, miembro: nombre, correo: m.correo }));
      setMemberDetails({
        categoria: m.categoria,
        cuota: Math.round(m.cuota || 0),
        saldo: Math.round(m.saldoPendiente || 0),
        pendientes: Math.round(m.cuotasPendientes || 0)
      });
      
      // Auto-concepto logic from original
      let autoConc = "Membresía";
      if (m.categoria === "Refrigerios") autoConc = "Refrigerios";
      else if (m.categoria === "Primer Nivel") autoConc = "Primer Nivel";
      
      updateConcepto(autoConc, nombre, formData.radioFila, formData.cat2);
    }
  };

  const updateConcepto = (concName, memberName, radio, cat2) => {
    const c = data.conceptos.find(x => x.concepto === concName);
    const esCuota = c ? c.esCuota.toLowerCase() : "";
    setFormData(prev => ({ ...prev, concepto: concName, esCuota }));
    
    updateCodigo(concName, esCuota, memberName, radio, cat2);
  };

  const updateCodigo = (concName, esCuota, memberName, radio, cat2) => {
    const catActiva = radio === "1" ? memberDetails.categoria : cat2;
    const miem = data.miembros.find(x => x.nombre === memberName && x.categoria === catActiva);
    const conc = data.conceptos.find(x => x.concepto === concName);
    
    const newCodigo = (esCuota === "si") ? (miem ? miem.codigoRef : "") : (conc ? conc.codigoAux : "");
    setFormData(prev => ({ ...prev, codigo: newCodigo }));
  };

  const handleCat2Change = (catName) => {
    setFormData(prev => ({ ...prev, cat2: catName, radioFila: "2" }));
    const m2 = data.miembros.find(x => x.nombre === formData.miembro && x.categoria === catName);
    if (m2) {
      setMemberDetails2({
        cuota: Math.round(m2.cuota || 0),
        saldo: Math.round(m2.saldoPendiente || 0),
        pendientes: Math.round(m2.cuotasPendientes || 0)
      });
    } else {
      setMemberDetails2({ cuota: 0, saldo: 0, pendientes: 0 });
    }
    updateCodigo(formData.concepto, formData.esCuota, formData.miembro, "2", catName);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.miembro) return alert("Seleccione un miembro");
    
    // Validation from original
    if (formData.codigo === "" && formData.concepto !== "Especies" && formData.concepto !== "Coacna") {
      return alert("El Campo Codigo esta vacio, es posible que el usuario no este registrado");
    }

    setLoading(true);
    try {
      const activeSaldo = formData.radioFila === "1" ? memberDetails.saldo : memberDetails2.saldo;
      const activeCuota = formData.radioFila === "1" ? memberDetails.cuota : memberDetails2.cuota;
      
      const payload = {
        ...formData,
        saldo: activeSaldo,
        cuota: activeCuota
      };
      
      await saveRecord(payload);
      alert("Registro guardado con éxito");
      // Reset logic
      setSearch("");
      setFormData(prev => ({ ...prev, miembro: "", valor: "", observaciones: "" }));
      setMemberDetails({ categoria: "-", cuota: 0, saldo: 0, pendientes: 0 });
      setMemberDetails2({ cuota: 0, saldo: 0, pendientes: 0 });
    } catch (err) {
      alert("Error al guardar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data.miembros.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loader"></div>
        <p style={{ marginTop: '20px' }}>Iniciando Economía...</p>
      </div>
    );
  }

  return (
    <main>
      <header style={{ textAlign: 'center', marginBottom: '30px' }}>
        <h1>App Economía</h1>
        <p className="subtitle">Registro de pagos y membresías</p>
      </header>

      <form onSubmit={handleSubmit}>
        <div className="glass-card">
          <div className="row">
            <div className="input-group">
              <label>Fecha</label>
              <input 
                type="date" 
                value={formData.fecha} 
                onChange={e => setFormData({...formData, fecha: e.target.value})}
              />
            </div>
            <div className="input-group">
              <label>Responsable</label>
              <select 
                value={formData.responsable} 
                onChange={e => setFormData({...formData, responsable: e.target.value})}
                required
              >
                <option value="">Seleccione...</option>
                {data.responsables.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Buscar Miembro</label>
            <div className="autocomplete-container" ref={autocompleteRef}>
              <input 
                type="text" 
                placeholder="Escriba nombre o apellido..."
                value={search}
                onChange={e => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              {showSuggestions && filteredMiembros.length > 0 && (
                <div className="suggestions-list">
                  {filteredMiembros.map((m, i) => (
                    <div 
                      key={i} 
                      className="suggestion-item"
                      onClick={() => handleSelectMember(m.nombre)}
                    >
                      {m.nombre} <span className="badge">{m.categoria}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="input-group">
            <label>Correo</label>
            <input type="text" value={formData.correo} readOnly style={{ opacity: 0.7 }} />
          </div>
        </div>

        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--accent-color)', textTransform: 'uppercase' }}>Detalles de Membresía</h3>
            <div className="checkbox-container">
              <input 
                type="checkbox" 
                checked={formData.enviarCorreo} 
                onChange={e => setFormData({...formData, enviarCorreo: e.target.checked})}
              />
              <span style={{ fontSize: '12px' }}>Enviar Aviso</span>
            </div>
          </div>

          {/* Fila 1 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px', marginBottom: '20px' }}>
            <input 
              type="radio" 
              name="fila" 
              value="1" 
              checked={formData.radioFila === "1"} 
              onChange={() => {
                setFormData({...formData, radioFila: "1"});
                updateCodigo(formData.concepto, formData.esCuota, formData.miembro, "1", formData.cat2);
              }}
              style={{ width: '24px', height: '24px', marginTop: '10px' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{memberDetails.categoria}</div>
              <div className="member-details">
                <div className="detail-item">
                  <div className="detail-label">Cuota</div>
                  <div className="detail-value">${memberDetails.cuota}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Saldo</div>
                  <div className="detail-value">${memberDetails.saldo}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Fila 2 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
            <input 
              type="radio" 
              name="fila" 
              value="2" 
              checked={formData.radioFila === "2"} 
              onChange={() => {
                setFormData({...formData, radioFila: "2"});
                updateCodigo(formData.concepto, formData.esCuota, formData.miembro, "2", formData.cat2);
              }}
              style={{ width: '24px', height: '24px', marginTop: '10px' }}
            />
            <div style={{ flex: 1 }}>
              <select 
                value={formData.cat2} 
                onChange={e => handleCat2Change(e.target.value)}
                style={{ padding: '8px', marginBottom: '10px' }}
              >
                <option value="">Otra Categoría...</option>
                {data.categoriasLista.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="member-details">
                <div className="detail-item">
                  <div className="detail-label">Cuota</div>
                  <div className="detail-value">${memberDetails2.cuota}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Saldo</div>
                  <div className="detail-value">${memberDetails2.saldo}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="row">
            <div className="input-group">
              <label>Concepto</label>
              <select 
                value={formData.concepto} 
                onChange={e => updateConcepto(e.target.value, formData.miembro, formData.radioFila, formData.cat2)}
                required
              >
                <option value="">Seleccione...</option>
                {data.conceptos.map(c => <option key={c.concepto} value={c.concepto}>{c.concepto}</option>)}
              </select>
            </div>
            <div className="input-group">
              <label>Es Cuota</label>
              <input type="text" value={formData.esCuota} readOnly style={{ opacity: 0.7 }} />
            </div>
          </div>

          <div className="row">
            <div className="input-group">
              <label>Valor ($)</label>
              <input 
                type="number" 
                step="0.01" 
                value={formData.valor}
                onChange={e => setFormData({...formData, valor: e.target.value})}
                required
              />
            </div>
            <div className="input-group">
              <label>Forma de Pago</label>
              <select 
                value={formData.formaDePago} 
                onChange={e => setFormData({...formData, formaDePago: e.target.value})}
              >
                <option>Efectivo</option>
                <option>Tarjeta</option>
                <option>Transferencia</option>
                <option>Pagala</option>
                <option>PayWay</option>
                <option>Especies</option>
              </select>
            </div>
          </div>

          <div className="input-group">
            <label>Código Interno</label>
            <input type="text" value={formData.codigo} readOnly style={{ opacity: 0.7 }} />
          </div>

          <div className="input-group">
            <label>Observaciones</label>
            <textarea 
              rows="2" 
              value={formData.observaciones}
              onChange={e => setFormData({...formData, observaciones: e.target.value})}
            ></textarea>
          </div>

          <button type="submit" disabled={loading}>
            {loading ? <div className="loader"></div> : "Guardar Registro"}
          </button>
        </div>
      </form>
    </main>
  );
}

export default App;
