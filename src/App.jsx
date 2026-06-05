import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchInitialData, saveRecord } from './services/api';
import { fetchRecordsByDate, saveRecordToFirestore } from './services/firebaseService';

function App() {
  const [activeTab, setActiveTab] = useState("registro");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ responsables: [], conceptos: [], miembros: [], categoriasLista: [] });
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const autocompleteRef = useRef(null);

  // States for query tab
  const [queryDate, setQueryDate] = useState(new Date().toISOString().split("T")[0]);
  const [queryResults, setQueryResults] = useState([]);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState(null);
  
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
        console.error(e);
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

  const handleQuery = useCallback(async () => {
    setQueryLoading(true);
    setQueryError(null);
    try {
      const records = await fetchRecordsByDate(queryDate);
      setQueryResults(records);
    } catch (err) {
      console.error(err);
      setQueryError("Error al consultar Firebase. Verifique la conexión.");
    } finally {
      setQueryLoading(false);
    }
  }, [queryDate]);

  useEffect(() => {
    if (activeTab === "consulta") {
      Promise.resolve().then(() => {
        handleQuery();
      });
    }
  }, [activeTab, handleQuery]);

  // Grouped sums calculation
  const groupedSums = useMemo(() => {
    const sums = {};
    queryResults.forEach(r => {
      const method = r.medioPago || "Especies";
      sums[method] = (sums[method] || 0) + (r.valor || 0);
    });
    return sums;
  }, [queryResults]);

  const totalGeneral = useMemo(() => {
    return queryResults.reduce((acc, curr) => acc + (curr.valor || 0), 0);
  }, [queryResults]);

  const getMethodClass = (method) => {
    if (!method) return "especies";
    const m = method.toLowerCase();
    if (m.includes("efectivo")) return "efectivo";
    if (m.includes("tarjeta")) return "tarjeta";
    if (m.includes("transfer")) return "transferencia";
    if (m.includes("pagala")) return "pagala";
    if (m.includes("payway")) return "payway";
    return "especies";
  };

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
      
      // Auto-concepto logic - keeping it as requested
      let autoConc = "Membresía";
      if (m.categoria === "Refrigerios") autoConc = "Refrigerios";
      else if (m.categoria === "Primer Nivel") autoConc = "Primer Nivel";
      
      // Pass m.categoria directly to avoid stale state in updateConcepto/updateCodigo
      updateConcepto(autoConc, nombre, formData.radioFila, formData.cat2, m.categoria);
    }
  };

  const updateConcepto = (concName, memberName, radio, cat2, cat1Override) => {
    const c = data.conceptos.find(x => x.concepto === concName);
    const esCuota = c ? c.esCuota.toLowerCase() : "";
    
    const newCodigo = calculateCodigo(concName, esCuota, memberName, radio, cat2, cat1Override || memberDetails.categoria);
    setFormData(prev => ({ ...prev, concepto: concName, esCuota, codigo: newCodigo }));
  };

  const calculateCodigo = (concName, esCuota, memberName, radio, cat2, cat1) => {
    const catActiva = radio === "1" ? cat1 : cat2;
    const miem = data.miembros.find(x => x.nombre === memberName && x.categoria === catActiva);
    const conc = data.conceptos.find(x => x.concepto === concName);
    
    return (esCuota === "si") ? (miem ? miem.codigoRef : "") : (conc ? conc.codigoAux : "");
  };

  const updateCodigo = (concName, esCuota, memberName, radio, cat2) => {
    const newCodigo = calculateCodigo(concName, esCuota, memberName, radio, cat2, memberDetails.categoria);
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
    if (!formData.responsable) return alert("Seleccione un responsable");
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
      
      // Save to Firebase Firestore first
      let firestoreId = "";
      try {
        const fbResponse = await saveRecordToFirestore(payload);
        if (fbResponse && fbResponse.name) {
          firestoreId = fbResponse.name.split("/").pop();
        }
      } catch (fbErr) {
        console.error("Error writing to Firestore:", fbErr);
        throw new Error("No se pudo guardar en Firebase. El registro no se enviará a Google Sheets: " + fbErr.message);
      }

      // Add the Firebase ID to the payload
      const payloadWithFb = {
        ...payload,
        idFirebase: firestoreId
      };

      // Save to Google Sheets (GAS)
      await saveRecord(payloadWithFb);
      
      alert("Registro guardado con éxito (Firebase y Google Sheets)");
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
    <div className={`app-wrapper ${activeTab === 'consulta' ? 'wide' : ''}`}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1>App Economía</h1>
        <p className="subtitle">Registro de pagos y membresías</p>
      </header>

      {/* Selector de pestañas */}
      <div className="tabs-container">
        <button
          type="button"
          className={`tab-btn ${activeTab === 'registro' ? 'active' : ''}`}
          onClick={() => setActiveTab('registro')}
        >
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Registro de Pago
        </button>
        <button
          type="button"
          className={`tab-btn ${activeTab === 'consulta' ? 'active' : ''}`}
          onClick={() => setActiveTab('consulta')}
        >
          <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Consulta por Fecha
        </button>
      </div>

      {activeTab === 'registro' ? (
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
              {loading ? <div className="loader" style={{ borderTopColor: '#fff' }}></div> : "Guardar Registro"}
            </button>
          </div>
        </form>
      ) : (
        <div style={{ animation: 'slideUp 0.5s ease-out' }}>
          <div className="glass-card">
            <div className="query-filter-card">
              <div className="input-group" style={{ marginBottom: 0 }}>
                <label>Fecha de Consulta</label>
                <input 
                  type="date" 
                  value={queryDate} 
                  onChange={e => setQueryDate(e.target.value)}
                />
              </div>
              <button 
                type="button" 
                onClick={() => handleQuery()} 
                disabled={queryLoading}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {queryLoading ? (
                  <div className="loader" style={{ width: 18, height: 18, borderTopColor: '#fff' }}></div>
                ) : (
                  <>
                    <svg style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Buscar
                  </>
                )}
              </button>
            </div>
          </div>

          {queryLoading && queryResults.length === 0 ? (
            <div className="glass-card">
              <div className="status-box">
                <div className="loader" style={{ width: 36, height: 36 }}></div>
                <p>Cargando registros desde Firebase...</p>
              </div>
            </div>
          ) : queryError ? (
            <div className="glass-card">
              <div className="status-box error">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p>{queryError}</p>
                <button type="button" onClick={() => handleQuery()} style={{ width: 'auto', padding: '8px 20px', fontSize: 14 }}>Reintentar</button>
              </div>
            </div>
          ) : queryResults.length === 0 ? (
            <div className="glass-card">
              <div className="status-box">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>No se encontraron registros para la fecha seleccionada.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="glass-card" style={{ padding: '16px', overflow: 'hidden' }}>
                <h3 style={{ fontSize: '13px', color: 'var(--accent-color)', textTransform: 'uppercase', marginBottom: '14px', paddingLeft: '8px', fontWeight: 600, letterSpacing: '1px' }}>
                  Registros Encontrados
                </h3>
                <div className="table-responsive">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Miembro</th>
                        <th>Concepto</th>
                        <th>Medio Pago</th>
                        <th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queryResults.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.fecha.split('T')[0].split(' ')[0]}</td>
                          <td className="font-semibold">{row.miembro}</td>
                          <td><span className="badge-concept">{row.concepto}</span></td>
                          <td>
                            <span className={`badge-method ${getMethodClass(row.medioPago)}`}>
                              {row.medioPago}
                            </span>
                          </td>
                          <td className="font-bold text-right">${row.valor.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grouped-sums-container">
                <h3>Resumen por Medio de Pago</h3>
                <div className="sums-grid">
                  {Object.entries(groupedSums).map(([method, sum]) => (
                    <div key={method} className="sum-card">
                      <span className="sum-method">{method}</span>
                      <span className="sum-value">${sum.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="sum-card total">
                    <span className="sum-method">Total General</span>
                    <span className="sum-value">${totalGeneral.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
