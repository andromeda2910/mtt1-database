import React, { useState, useRef, useCallback, useMemo } from "react";
import { Plus, Trash2, X, Copy, Check, Database, Star, Link2, ArrowRight, ArrowLeft } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const DATA_TYPES = ["Text", "Character", "Integer", "Real", "Boolean", "Date"];
const TABLE_W = 250;
const ROW_H = 40;
const HEADER_H = 46;
const FOOTER_H = 42;

let uidCounter = 1;
const uid = () => `id${uidCounter++}`;

function newField(name = "field_name") {
  return { id: uid(), name, type: "Text", pk: false, fk: false, refTable: null, refField: null };
}

function newTable(x, y, index) {
  return {
    id: uid(),
    name: `Table_${index}`,
    x,
    y,
    fields: [{ ...newField("ID"), pk: true }],
  };
}

function tableHeight(t) {
  return HEADER_H + t.fields.length * ROW_H + FOOTER_H;
}

function fieldPos(t, i) {
  return { x: t.x, y: t.y + HEADER_H + i * ROW_H + ROW_H / 2, xRight: t.x + TABLE_W };
}

export default function MultiStepDbDesigner() {
  const [step, setStep] = useState(1);
  const [studentInfo, setStudentInfo] = useState({
    name: "",
    class: "Clive Staples Lewis",
    scenario: "School Computer Lab"
  });

  const [tables, setTables] = useState([]);

  const [selected, setSelected] = useState(null);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const counter = useRef(1);

  const [explanations, setExplanations] = useState({
    threeTablesBenefit: "",
    primaryKeyRole: "",
    foreignKeyRole: "",
    removedFkConsequences: ""
  });

  const updateTable = useCallback((id, fn) => {
    setTables((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const addTable = () => {
    const n = counter.current++;
    const t = newTable(60 + ((n * 30) % 200), 60 + ((n * 30) % 150), n);
    setTables((prev) => [...prev, t]);
    setSelected(t.id);
  };

  const removeTable = (id) => {
    setTables((prev) =>
      prev
        .filter((t) => t.id !== id)
        .map((t) => ({
          ...t,
          fields: t.fields.map((f) => (f.fk && f.refTable === id ? { ...f, fk: false, refTable: null, refField: null } : f)),
        }))
    );
  };

  const addField = (id) => updateTable(id, (t) => ({ ...t, fields: [...t.fields, newField(`field_${t.fields.length + 1}`)] }));
  const removeField = (id, fid) => updateTable(id, (t) => ({ ...t, fields: t.fields.filter((f) => f.id !== fid) }));
  const editField = (id, fid, patch) =>
    updateTable(id, (t) => ({ ...t, fields: t.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) }));

  const handleFkTableSelect = (tableId, fieldId, refTableId) => {
    if (!refTableId) {
      editField(tableId, fieldId, { refTable: null, refField: null });
      return;
    }

    const targetTable = tables.find((t) => t.id === refTableId);
    if (!targetTable) return;

    const targetPkField = targetTable.fields.find((f) => f.pk) || targetTable.fields[0];

    if (targetPkField) {
      editField(tableId, fieldId, {
        refTable: refTableId,
        refField: targetPkField.id,
        name: targetPkField.name,
        type: targetPkField.type
      });
    } else {
      editField(tableId, fieldId, { refTable: refTableId, refField: null });
    }
  };

  const startDrag = (e, id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (e.target.setPointerCapture) {
      e.target.setPointerCapture(e.pointerId);
    }

    const rect = canvas.getBoundingClientRect();
    const t = tables.find((tt) => tt.id === id);
    dragRef.current = { 
      id, 
      pointerId: e.pointerId,
      offX: e.clientX - rect.left + canvas.scrollLeft - t.x, 
      offY: e.clientY - rect.top + canvas.scrollTop - t.y 
    };
    setSelected(id);
    
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  };

  const onDrag = useCallback((e) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, e.clientX - rect.left + canvas.scrollLeft - d.offX);
    const y = Math.max(0, e.clientY - rect.top + canvas.scrollTop - d.offY);
    setTables((prev) => prev.map((t) => (t.id === d.id ? { ...t, x, y } : t)));
  }, []);

  const endDrag = useCallback((e) => {
    if (dragRef.current && e?.target?.releasePointerCapture && dragRef.current.pointerId !== undefined) {
      try {
        e.target.releasePointerCapture(dragRef.current.pointerId);
      } catch {}
    }
    dragRef.current = null;
    window.removeEventListener("pointermove", onDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
  }, [onDrag]);

  const links = useMemo(() => {
    const out = [];
    tables.forEach((t) => {
      t.fields.forEach((f, i) => {
        if (f.fk && f.refTable && f.refField) {
          const target = tables.find((tt) => tt.id === f.refTable);
          if (!target) return;
          const ti = target.fields.findIndex((tf) => tf.id === f.refField);
          if (ti === -1) return;
          out.push({
            id: `${f.id}-${f.refField}`,
            from: fieldPos(t, i),
            to: fieldPos(target, ti),
            active: selected === t.id || selected === target.id,
          });
        }
      });
    });
    return out;
  }, [tables, selected]);

  const canvasW = Math.max(1200, ...tables.map((t) => t.x + TABLE_W + 160));
  const canvasH = Math.max(700, ...tables.map((t) => t.y + tableHeight(t) + 160));

  const buildSql = () =>
    tables
      .map((t) => {
        const lines = t.fields.map((f) => `  ${f.name} ${f.type}${f.pk ? " PRIMARY KEY" : ""}`);
        const fks = t.fields
          .filter((f) => f.fk && f.refTable && f.refField)
          .map((f) => {
            const target = tables.find((tt) => tt.id === f.refTable);
            const tf = target?.fields.find((x) => x.id === f.refField);
            return target && tf ? `  FOREIGN KEY (${f.name}) REFERENCES ${target.name}(${tf.name})` : null;
          })
          .filter(Boolean);
        return `CREATE TABLE ${t.name} (
${[...lines, ...fks].join(",\n")}
);`;
      })
      .join("\n\n");

  const copySql = async () => {
    try {
      await navigator.clipboard.writeText(buildSql());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleNextFromStep1 = () => {
    if (!studentInfo.name.trim()) {
      alert("⚠️ Please enter your Full Name first!");
      return;
    }
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    if (tables.length === 0) {
      alert("⚠️ Please create at least one table for your database design!");
      return;
    }
    setStep(3);
  };

  const handleExportPDF = async () => {
    if (!explanations.threeTablesBenefit || !explanations.primaryKeyRole) {
      alert("⚠️ Please fill out at least the key reflection questions before submitting!");
      return;
    }

    setIsExporting(true);
    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(46, 42, 92);
      doc.text("Mid Term Test: Database Design Report", margin, y);
      y += 8;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(`Full Name: ${studentInfo.name}  |  Class: ${studentInfo.class}  |  Scenario: ${studentInfo.scenario}`, margin, y);
      y += 6;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 8;

      if (canvasRef.current) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(46, 42, 92);
        doc.text("Database Schema Diagram:", margin, y);
        y += 6;

        const canvasElement = canvasRef.current;
        const canvasImage = await html2canvas(canvasElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: "#332E68"
        });
        const imgData = canvasImage.toDataURL("image/png");
        
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (canvasImage.height * imgWidth) / canvasImage.width;
        
        const maxHeight = 70;
        let finalImgHeight = imgHeight;
        let finalImgWidth = imgWidth;
        if (imgHeight > maxHeight) {
          finalImgHeight = maxHeight;
          finalImgWidth = (canvasImage.width * maxHeight) / canvasImage.height;
        }

        doc.addImage(imgData, "PNG", margin, y, finalImgWidth, finalImgHeight);
        y += finalImgHeight + 10;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(46, 42, 92);
      doc.text("Design Explanations & Reflections:", margin, y);
      y += 6;

      doc.setFontSize(10);
      const addAnswerSection = (title, answer) => {
        if (y > pageHeight - 35) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(title, margin, y);
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const splitText = doc.splitTextToSize(answer || "-", pageWidth - (margin * 2));
        doc.text(splitText, margin, y);
        y += (splitText.length * 5) + 6;
      };

      addAnswerSection("1. Benefits of 3 Related Tables vs 1 Single Table:", explanations.threeTablesBenefit);
      addAnswerSection("2. Primary Keys Role in Accuracy & Organisation:", explanations.primaryKeyRole);
      addAnswerSection("3. Foreign Keys Role in Table Integration:", explanations.foreignKeyRole);
      addAnswerSection("4. Impact & Consequences of Removing Foreign Keys:", explanations.removedFkConsequences);

      doc.save(`Database_Design_${studentInfo.name.replace(/\s+/g, "_")}.pdf`);
      alert("🎉 Success! Your PDF report with the database diagram has been downloaded.");
    } catch (err) {
      console.error(err);
      alert("⚠️ Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      style={{
        fontFamily: "'Nunito Sans', 'Segoe UI', sans-serif",
        background: "#2E2A5C",
        color: "#F4F2FA",
        width: "100%",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;800&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
        input, select, textarea {
          font-family: 'Nunito Sans', sans-serif;
          background: #3A3570;
          border: 1.5px solid #524C99;
          color: #F4F2FA;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 13px;
          outline: none;
        }
        input:focus, select:focus, textarea:focus { border-color: #FFC857; }
        button { font-family: 'Nunito Sans', sans-serif; cursor: pointer; }
        .badge {
          border: 1.5px solid #524C99;
          border-radius: 6px;
          padding: 5px 9px;
          font-size: 12px;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          color: #A9A3E0;
          transition: all 0.12s ease;
        }
        .badge.on-pk { background: #FFC857; border-color: #FFC857; color: #2E2A5C; }
        .badge.on-fk { background: #5FD4C1; border-color: #5FD4C1; color: #2E2A5C; }
        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: #2E2A5C; }
        ::-webkit-scrollbar-thumb { background: #524C99; border-radius: 5px; }
        .drag-handle { touch-action: none; user-select: none; }
      `}</style>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid #453F85", flexShrink: 0, background: "#292460" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Database size={22} color="#FFC857" />
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Mid Term Test: Database Design Studio</div>
            <div style={{ fontSize: 12, color: "#A9A3E0" }}>Step {step} of 3 &mdash; {step === 1 ? "Identity & Scenario" : step === 2 ? "Schema Canvas Designer" : "Design Explanation"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: step === 1 ? "#FFC857" : "#3A3570", color: step === 1 ? "#2E2A5C" : "#A9A3E0" }}>1. Identity</span>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: step === 2 ? "#FFC857" : "#3A3570", color: step === 2 ? "#2E2A5C" : "#A9A3E0" }}>2. Table Design</span>
          <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: step === 3 ? "#FFC857" : "#3A3570", color: step === 3 ? "#2E2A5C" : "#A9A3E0" }}>3. Explanation</span>
        </div>
      </div>

      {/* STEP 1: IDENTITY & SCENARIO */}
      {step === 1 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 520, background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 16, padding: 30, boxShadow: "0 10px 25px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 5 }}>Welcome to Practical Mid Term Exam</h2>
              <p style={{ fontSize: 13, color: "#A9A3E0" }}>Please fill in your student identity and select a database scenario before proceeding.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#A9A3E0", marginBottom: 6, textTransform: "uppercase" }}>Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Alex Johnson"
                  style={{ width: "100%" }}
                  value={studentInfo.name}
                  onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#A9A3E0", marginBottom: 6, textTransform: "uppercase" }}>Class *</label>
                <select
                  style={{ width: "100%" }}
                  value={studentInfo.class}
                  onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value })}
                >
                  <option value="Clive Staples Lewis">Clive Staples Lewis</option>
                  <option value="George Frideric Handel">George Frideric Handel</option>
                  <option value="Mother Teresa">Mother Teresa</option>
                  <option value="Thomas Alfa Edison">Thomas Alfa Edison</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#A9A3E0", marginBottom: 6, textTransform: "uppercase" }}>Database Scenario</label>
                <select
                  style={{ width: "100%" }}
                  value={studentInfo.scenario}
                  onChange={(e) => setStudentInfo({ ...studentInfo, scenario: e.target.value })}
                >
                  <option value="School Computer Lab">School Computer Lab</option>
                  <option value="School Sports Equipment Room">School Sports Equipment Room</option>
                  <option value="School Cafetaria">School Cafetaria</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleNextFromStep1}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 14, marginTop: 10 }}
            >
              Proceed to Table Design <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CANVAS DESIGNER */}
      {step === 2 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 22px", background: "#332E68", borderBottom: "1px solid #453F85" }}>
            <div style={{ fontSize: 13, color: "#A9A3E0" }}>
              Scenario: <b style={{ color: "#FFC857" }}>{studentInfo.scenario}</b> &bull; Drag table headers to reposition cards.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={addTable}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 8, padding: "7px 12px", fontWeight: 800, fontSize: 12 }}
              >
                <Plus size={15} /> Add Table
              </button>
              <button
                onClick={() => setSqlOpen(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 8, padding: "7px 12px", fontWeight: 600, fontSize: 12 }}
              >
                View as SQL
              </button>
            </div>
          </div>

          <div
            ref={canvasRef}
            onPointerDown={() => setSelected(null)}
            style={{
              flex: 1,
              overflow: "auto",
              position: "relative",
              backgroundImage: "linear-gradient(#3A3570 1px, transparent 1px), linear-gradient(90deg, #3A3570 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              backgroundColor: "#332E68",
              touchAction: "pan-x pan-y",
            }}
          >
            <div style={{ position: "relative", width: canvasW, height: canvasH }}>
              <svg width={canvasW} height={canvasH} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                {links.map((l) => {
                  const rightward = l.from.x < l.to.x;
                  const x1 = rightward ? l.from.xRight : l.from.x;
                  const x2 = rightward ? l.to.x : l.to.xRight;
                  const midX = (x1 + x2) / 2;
                  const color = l.active ? "#FFC857" : "#5FD4C1";
                  return (
                    <g key={l.id}>
                      <path d={`M ${x1} ${l.from.y} C ${midX} ${l.from.y}, ${midX} ${l.to.y}, ${x2} ${l.to.y}`} fill="none" stroke={color} strokeWidth={l.active ? 3 : 2} opacity={l.active ? 1 : 0.65} />
                      <circle cx={x1} cy={l.from.y} r={4} fill={color} />
                      <circle cx={x2} cy={l.to.y} r={4} fill={color} />
                    </g>
                  );
                })}
              </svg>

              {tables.map((t) => (
                <div
                  key={t.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    position: "absolute",
                    left: t.x,
                    top: t.y,
                    width: TABLE_W,
                    background: "#3A3570",
                    border: `2px solid ${selected === t.id ? "#FFC857" : "#524C99"}`,
                    borderRadius: 10,
                    boxShadow: selected === t.id ? "0 0 0 4px rgba(255,200,87,0.16)" : "0 6px 16px rgba(0,0,0,0.28)",
                  }}
                >
                  <div
                    className="drag-handle"
                    onPointerDown={(e) => startDrag(e, t.id)}
                    style={{ height: HEADER_H, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", cursor: "grab", borderBottom: "1.5px solid #524C99", background: "#292460", borderRadius: "8px 8px 0 0" }}
                  >
                    <input
                      value={t.name}
                      onChange={(e) => updateTable(t.id, (tt) => ({ ...tt, name: e.target.value.replace(/\s+/g, "_") }))}
                      onPointerDown={(e) => e.stopPropagation()}
                      style={{ flex: 1, fontWeight: 800, fontSize: 14, background: "transparent", border: "none", padding: "3px 4px" }}
                    />
                    <button onPointerDown={(e) => e.stopPropagation()} onClick={() => removeTable(t.id)} style={{ background: "transparent", border: "none", color: "#F08A6C", padding: 2 }} title="Delete table">
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div>
                    {t.fields.map((f) => (
                      <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderBottom: "1px solid #453F85" }}>
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input value={f.name} onChange={(e) => editField(t.id, f.id, { name: e.target.value.replace(/\s+/g, "_") })} style={{ width: 84, fontSize: 12, padding: "5px 6px" }} />
                          <select value={f.type} onChange={(e) => editField(t.id, f.id, { type: e.target.value })} style={{ flex: 1, fontSize: 11, padding: "5px 3px" }}>
                            {DATA_TYPES.map((dt) => (
                              <option key={dt} value={dt}>{dt}</option>
                            ))}
                          </select>
                          <button onClick={() => removeField(t.id, f.id)} style={{ background: "transparent", border: "none", color: "#8A84C4", padding: 0 }} title="Delete field">
                            <X size={14} />
                          </button>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className={`badge ${f.pk ? "on-pk" : ""}`} onClick={() => editField(t.id, f.id, { pk: !f.pk })} title="Primary Key">
                            <Star size={11} /> PK
                          </button>
                          <button
                            className={`badge ${f.fk ? "on-fk" : ""}`}
                            onClick={() => editField(t.id, f.id, f.fk ? { fk: false, refTable: null, refField: null } : { fk: true })}
                            title="Foreign Key"
                          >
                            <Link2 size={11} /> FK
                          </button>
                        </div>
                        {f.fk && (
                          <div style={{ display: "flex", gap: 5 }}>
                            <select 
                              value={f.refTable || ""} 
                              onChange={(e) => handleFkTableSelect(t.id, f.id, e.target.value || null)} 
                              style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}
                            >
                              <option value="">target table?</option>
                              {tables.filter((tt) => tt.id !== t.id).map((tt) => (
                                <option key={tt.id} value={tt.id}>{tt.name}</option>
                              ))}
                            </select>
                            <select 
                              value={f.refField || ""} 
                              onChange={(e) => editField(t.id, f.id, { refField: e.target.value || null })} 
                              disabled={!f.refTable} 
                              style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}
                            >
                              <option value="">target field?</option>
                              {tables.find((tt) => tt.id === f.refTable)?.fields.map((tf) => (
                                <option key={tf.id} value={tf.id}>{tf.name} {tf.pk ? "(PK)" : ""}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <button onClick={() => addField(t.id)} style={{ width: "100%", height: FOOTER_H, background: "transparent", border: "none", color: "#A9A3E0", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: "0 0 8px 8px" }}>
                    <Plus size={14} /> Add field
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 22px", background: "#292460", borderTop: "1px solid #453F85" }}>
            <button
              onClick={() => setStep(1)}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 8, padding: "8px 14px", fontWeight: 600, fontSize: 13 }}
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              onClick={handleNextFromStep2}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 800, fontSize: 13 }}
            >
              Proceed to Essay Questions <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: EXPLANATION QUESTIONS */}
      {step === 3 && (
        <div style={{ flex: 1, overflowY: "auto", padding: "30px 20px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 700, background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 16, padding: 30, boxShadow: "0 10px 25px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 5 }}>Step 3: Design Explanation & Reflection</h2>
              <p style={{ fontSize: 13, color: "#A9A3E0" }}>Answer the following questions based on the database schema you created in Step 2.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  1. Why is organising the data into three related tables a better solution than storing everything in one table?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%" }}
                  placeholder="Write your explanation here..."
                  value={explanations.threeTablesBenefit}
                  onChange={(e) => setExplanations({ ...explanations, threeTablesBenefit: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  2. How do the <b style={{ color: "#FFC857" }}>Primary Keys</b> you selected help keep your database organised and accurate?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%" }}
                  placeholder="Explain the role of Primary Keys..."
                  value={explanations.primaryKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, primaryKeyRole: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  3. How do the <b style={{ color: "#5FD4C1" }}>Foreign Keys</b> in your design help different tables work together?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%" }}
                  placeholder="Explain how Foreign Keys connect tables..."
                  value={explanations.foreignKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, foreignKeyRole: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  4. If one of your Foreign Keys were removed, what problems might occur in your database? Explain your reasoning.
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%" }}
                  placeholder="Explain potential issues if a Foreign Key is removed..."
                  value={explanations.removedFkConsequences}
                  onChange={(e) => setExplanations({ ...explanations, removedFkConsequences: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #524C99", paddingTop: 20, marginTop: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13 }}
              >
                <ArrowLeft size={16} /> Back to Design
              </button>
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "#5FD4C1", color: "#2E2A5C", border: "none", borderRadius: 8, padding: "12px 24px", fontWeight: 800, fontSize: 14, boxShadow: "0 4px 15px rgba(95, 212, 193, 0.3)" }}
              >
                {isExporting ? "Processing..." : "Download PDF & Submit 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}