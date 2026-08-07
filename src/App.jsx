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
    name: `Table${index}`,
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
  const canvasInnerRef = useRef(null);
  const dragRef = useRef(null);
  const counter = useRef(1);

  const [explanations, setExplanations] = useState({
    separationReason: "",
    primaryKeyRole: "",
    foreignKeyRole: "",
    fkRemovedProblems: ""
  });

  const updateTable = useCallback((id, fn) => {
    setTables((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const addTable = () => {
    const n = counter.current++;
    const t = newTable(50 + ((n * 40) % 250), 50 + ((n * 40) % 150), n);
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

  const addField = (id) => updateTable(id, (t) => ({ ...t, fields: [...t.fields, newField(`field${t.fields.length + 1}`)] }));
  const removeField = (id, fid) => updateTable(id, (t) => ({ ...t, fields: t.fields.filter((f) => f.id !== fid) }));
  
  const editField = (id, fid, patch) =>
    updateTable(id, (t) => ({
      ...t,
      fields: t.fields.map((f) => {
        if (f.id !== fid) return f;
        const updated = { ...f, ...patch };
        
        if (patch.fk === true && !f.fk) {
          const otherTables = tables.filter((tt) => tt.id !== id);
          if (otherTables.length > 0) {
            const targetT = otherTables[0];
            updated.refTable = targetT.id;
            const pkField = targetT.fields.find((tf) => tf.pk) || targetT.fields[0];
            if (pkField) {
              updated.refField = pkField.id;
              updated.type = pkField.type;
            }
            updated.name = `${targetT.name}_ID`;
          }
        }

        if (patch.refTable !== undefined) {
          if (!patch.refTable) {
            updated.refField = null;
          } else {
            const targetT = tables.find((tt) => tt.id === patch.refTable);
            if (targetT) {
              const pkField = targetT.fields.find((tf) => tf.pk) || targetT.fields[0];
              if (pkField) {
                updated.refField = pkField.id;
                updated.type = pkField.type;
              } else {
                updated.refField = null;
              }
              updated.name = `${targetT.name}_ID`;
            } else {
              updated.refField = null;
            }
          }
        }

        if (patch.refField !== undefined && patch.refField) {
          const targetT = tables.find((tt) => tt.id === (patch.refTable || f.refTable));
          if (targetT) {
            const targetF = targetT.fields.find((tf) => tf.id === patch.refField);
            if (targetF) {
              updated.type = targetF.type;
            }
          }
        }

        return updated;
      }),
    }));

  // ================= UNIFIED DRAG HANDLERS (MOUSE + TOUCH) =================
  const handleDragMove = useCallback((clientX, clientY) => {
    const d = dragRef.current;
    const canvas = canvasRef.current;
    if (!d || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left + canvas.scrollLeft - d.offX);
    const y = Math.max(0, clientY - rect.top + canvas.scrollTop - d.offY);
    setTables((prev) => prev.map((t) => (t.id === d.id ? { ...t, x, y } : t)));
  }, []);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
  }, []);

  const onMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
  const onMouseUp = () => handleDragEnd();
  const onTouchMove = (e) => {
    if (e.touches && e.touches[0]) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  const onTouchEnd = () => handleDragEnd();

  const startMouseDrag = (e, id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t = tables.find((tt) => tt.id === id);
    if (!t) return;
    dragRef.current = { id, offX: e.clientX - rect.left + canvas.scrollLeft - t.x, offY: e.clientY - rect.top + canvas.scrollTop - t.y };
    setSelected(id);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startTouchDrag = (e, id) => {
    const canvas = canvasRef.current;
    if (!canvas || !e.touches || !e.touches[0]) return;
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const t = tables.find((tt) => tt.id === id);
    if (!t) return;
    dragRef.current = { id, offX: touch.clientX - rect.left + canvas.scrollLeft - t.x, offY: touch.clientY - rect.top + canvas.scrollTop - t.y };
    setSelected(id);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };
  // =========================================================================

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
        return `CREATE TABLE ${t.name} (\n${[...lines, ...fks].join(",\n")}\n);`;
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
      alert("⚠️ Please enter your Full Name before proceeding!");
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

  // ================= PDF EXPORT =================
  const handleExportPDF = async () => {
    if (!explanations.separationReason || !explanations.primaryKeyRole) {
      alert("⚠️ Please complete the reflection questions in step 3 before submitting!");
      return;
    }

    setIsExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const doc = new jsPDF("p", "mm", "a4");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(46, 42, 92);
      doc.text("Mid Term Test: Database Design Report", margin, y);
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      doc.text(`Full Name: ${studentInfo.name}  |  Class: ${studentInfo.class}`, margin, y);
      y += 5;
      doc.text(`Scenario: ${studentInfo.scenario}`, margin, y);
      y += 7;

      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;

      const targetElement = canvasInnerRef.current || canvasRef.current;
      
      if (targetElement) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(46, 42, 92);
        doc.text("Database Schema Diagram & Relations:", margin, y);
        y += 5;

        const canvasImage = await html2canvas(targetElement, {
          scale: 2, 
          useCORS: true,
          backgroundColor: "#332E68",
          logging: false
        });
        const imgData = canvasImage.toDataURL("image/png");
        
        const imgWidth = pageWidth - (margin * 2);
        const imgHeight = (canvasImage.height * imgWidth) / canvasImage.width;
        
        const maxHeight = 75; 
        let finalImgHeight = imgHeight;
        let finalImgWidth = imgWidth;
        if (imgHeight > maxHeight) {
          finalImgHeight = maxHeight;
          finalImgWidth = (canvasImage.width * maxHeight) / canvasImage.height;
        }

        doc.addImage(imgData, "PNG", margin, y, finalImgWidth, finalImgHeight);
        y += finalImgHeight + 6;
      }

      const fkMappings = [];
      tables.forEach((t) => {
        t.fields.forEach((f) => {
          if (f.fk && f.refTable && f.refField) {
            const refT = tables.find((tt) => tt.id === f.refTable);
            const refF = refT?.fields.find((ff) => ff.id === f.refField);
            if (refT && refF) {
              fkMappings.push(`${t.name}.${f.name}   REFERENCES   ${refT.name}.${refF.name}`);
            }
          }
        });
      });

      if (fkMappings.length > 0) {
        if (y > pageHeight - 30) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(46, 42, 92);
        doc.text("Foreign Key Relations Mapping:", margin, y);
        y += 5;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(60, 60, 60);
        fkMappings.forEach((mapping) => {
          doc.text(`•  ${mapping}`, margin + 3, y);
          y += 4.5;
        });
        y += 3;
      }

      if (y > pageHeight - 35) {
        doc.addPage();
        y = margin;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(46, 42, 92);
      doc.text("Design Explanations & Reflections:", margin, y);
      y += 5;

      doc.setFontSize(9);
      const addAnswerSection = (title, answer) => {
        if (y > pageHeight - 22) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40, 40, 40);
        doc.text(title, margin, y);
        y += 4.5;

        doc.setFont("helvetica", "normal");
        doc.setTextColor(80, 80, 80);
        const splitText = doc.splitTextToSize(answer || "-", pageWidth - (margin * 2));
        doc.text(splitText, margin, y);
        y += (splitText.length * 4.5) + 4;
      };

      addAnswerSection("1. Why is organising data into three related tables better than one table?", explanations.separationReason);
      addAnswerSection("2. How Primary Keys help keep database organised and accurate:", explanations.primaryKeyRole);
      addAnswerSection("3. How Foreign Keys help different tables work together:", explanations.foreignKeyRole);
      addAnswerSection("4. If one of your Foreign Keys were removed, what problems might occur in your database?", explanations.fkRemovedProblems);

      doc.save(`Database_Design_${studentInfo.name.replace(/\s+/g, "_") || "Report"}.pdf`);
      alert("🎉 Success! Your Portrait PDF report has been downloaded.");
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
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        overflowX: "hidden",
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
          padding: 4px 8px;
          font-size: 11px;
          font-weight: 800;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: transparent;
          color: #A9A3E0;
          transition: all 0.12s ease;
        }
        .badge.on-pk { background: #FFC857; border-color: #FFC857; color: #2E2A5C; }
        .badge.on-fk { background: #5FD4C1; border-color: #5FD4C1; color: #2E2A5C; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #2E2A5C; }
        ::-webkit-scrollbar-thumb { background: #524C99; border-radius: 4px; }
      `}</style>

      {/* HEADER UTAMA */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #453F85", flexShrink: 0, background: "#292460", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Database size={22} color="#FFC857" />
          <div>
            <div style={{ fontWeight: 800, fontSize: "clamp(14px, 1.8vw, 17px)" }}>Mid Term Test: Database Design Studio</div>
            <div style={{ fontSize: 11, color: "#A9A3E0" }}>Step {step} of 3 &mdash; {step === 1 ? "Identity & Scenario" : step === 2 ? "Schema Canvas Designer" : "Design Explanation"}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ padding: "3px 8px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: step === 1 ? "#FFC857" : "#3A3570", color: step === 1 ? "#2E2A5C" : "#A9A3E0" }}>1. ID</span>
          <span style={{ padding: "3px 8px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: step === 2 ? "#FFC857" : "#3A3570", color: step === 2 ? "#2E2A5C" : "#A9A3E0" }}>2. Design</span>
          <span style={{ padding: "3px 8px", borderRadius: 16, fontSize: 11, fontWeight: 800, background: step === 3 ? "#FFC857" : "#3A3570", color: step === 3 ? "#2E2A5C" : "#A9A3E0" }}>3. Essay</span>
        </div>
      </div>

      {/* ================= STEP 1 ================= */}
      {step === 1 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ width: "100%", maxWidth: 480, background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 16, padding: "24px 20px", boxShadow: "0 10px 25px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <h2 style={{ fontSize: "clamp(18px, 2.2vw, 22px)", fontWeight: 800, marginBottom: 4 }}>Welcome to Mid Term Exam</h2>
              <p style={{ fontSize: 12, color: "#A9A3E0" }}>Please fill in your student identity and select your database scenario.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#A9A3E0", marginBottom: 4, textTransform: "uppercase" }}>Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g., Alex Johnson"
                  style={{ width: "100%" }}
                  value={studentInfo.name}
                  onChange={(e) => setStudentInfo({ ...studentInfo, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#A9A3E0", marginBottom: 4, textTransform: "uppercase" }}>Class*</label>
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
                <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#A9A3E0", marginBottom: 4, textTransform: "uppercase" }}>Database Scenario *</label>
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
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 10, padding: "12px", fontWeight: 800, fontSize: 14, marginTop: 6 }}
            >
              Proceed to Table Design <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ================= STEP 2 ================= */}
      <div 
        style={
          step === 2 
            ? { flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 60px)", overflow: "hidden" }
            : { position: "fixed", top: "-9999px", left: "-9999px", width: canvasW, height: canvasH, overflow: "hidden", pointerEvents: "none" }
        }
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", background: "#332E68", borderBottom: "1px solid #453F85", gap: 8 }}>
          <div style={{ fontSize: 12, color: "#A9A3E0" }}>
            Scenario: <b style={{ color: "#FFC857" }}>{studentInfo.scenario}</b> &bull; Drag tables by header.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={addTable}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 6, padding: "6px 10px", fontWeight: 800, fontSize: 11 }}
            >
              <Plus size={14} /> Add Table
            </button>
            <button
              onClick={() => setSqlOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 6, padding: "6px 10px", fontWeight: 600, fontSize: 11 }}
            >
              View SQL
            </button>
          </div>
        </div>

        <div
          ref={canvasRef}
          onMouseDown={() => setSelected(null)}
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
          <div 
            ref={canvasInnerRef} 
            style={{ 
              position: "relative", 
              width: canvasW, 
              height: canvasH, 
              backgroundColor: "#332E68",
              fontFamily: isExporting ? "sans-serif" : "inherit"
            }}
          >
            {tables.length === 0 && !isExporting && (
              <div style={{ position: "absolute", top: "40%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", color: "#A9A3E0", width: "90%" }}>
                <Database size={42} color="#524C99" style={{ margin: "0 auto 8px", display: "block" }} />
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>No tables created yet</div>
                <div style={{ fontSize: 12 }}>Click <b style={{ color: "#FFC857" }}>"+ Add Table"</b> above to build tables.</div>
              </div>
            )}

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
                onMouseDown={(e) => e.stopPropagation()}
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
                  onMouseDown={(e) => startMouseDrag(e, t.id)}
                  onTouchStart={(e) => startTouchDrag(e, t.id)}
                  style={{ height: HEADER_H, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", cursor: "grab", borderBottom: "1.5px solid #524C99", background: "#292460", borderRadius: "8px 8px 0 0", touchAction: "none" }}
                >
                  {isExporting ? (
                    <div style={{ flex: 1, fontWeight: "bold", fontSize: 14, color: "#F4F2FA", padding: "3px 4px" }}>
                      {t.name}
                    </div>
                  ) : (
                    <input
                      value={t.name}
                      onChange={(e) => updateTable(t.id, (tt) => ({ ...tt, name: e.target.value.replace(/\s+/g, "_") }))}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      style={{ flex: 1, fontWeight: 800, fontSize: 13, background: "transparent", border: "none", padding: "3px 4px" }}
                    />
                  )}
                  
                  {!isExporting && (
                    <button onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onClick={() => removeTable(t.id)} style={{ background: "transparent", border: "none", color: "#F08A6C", padding: 2 }} title="Delete table">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                <div>
                  {t.fields.map((f) => (
                    <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderBottom: "1px solid #453F85" }}>
                      {isExporting ? (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "4px 2px", boxSizing: "border-box" }}>
                          <span style={{ fontWeight: "bold", fontSize: 13, color: "#F4F2FA", lineHeight: "normal" }}>{f.name}</span>
                          <span style={{ color: "#A9A3E0", fontSize: 12, fontWeight: "bold", lineHeight: "normal" }}>{f.type}</span>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                          <input value={f.name} onChange={(e) => editField(t.id, f.id, { name: e.target.value.replace(/\s+/g, "_") })} style={{ width: 80, fontSize: 11, padding: "5px 6px" }} />
                          <select value={f.type} onChange={(e) => editField(t.id, f.id, { type: e.target.value })} style={{ flex: 1, fontSize: 11, padding: "5px 3px" }}>
                            {DATA_TYPES.map((dt) => (
                              <option key={dt} value={dt}>{dt}</option>
                            ))}
                          </select>
                          <button onClick={() => removeField(t.id, f.id)} style={{ background: "transparent", border: "none", color: "#8A84C4", padding: 0 }} title="Delete field">
                            <X size={14} />
                          </button>
                        </div>
                      )}

                      <div style={{ display: "flex", gap: 6 }}>
                        {isExporting ? (
                          <div style={{ display: "flex", gap: 6, paddingLeft: 2 }}>
                            {f.pk && <span style={{ background: "#FFC857", color: "#2E2A5C", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: "bold" }}>PK</span>}
                            {f.fk && <span style={{ background: "#5FD4C1", color: "#2E2A5C", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: "bold" }}>FK</span>}
                          </div>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>

                      {!isExporting && f.fk && (
                        <div style={{ display: "flex", gap: 5 }}>
                          <select value={f.refTable || ""} onChange={(e) => editField(t.id, f.id, { refTable: e.target.value || null })} style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}>
                            <option value="">target table?</option>
                            {tables.filter((tt) => tt.id !== t.id).map((tt) => (
                              <option key={tt.id} value={tt.id}>{tt.name}</option>
                            ))}
                          </select>
                          <select value={f.refField || ""} onChange={(e) => editField(t.id, f.id, { refField: e.target.value || null })} disabled={!f.refTable} style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}>
                            <option value="">target field?</option>
                            {tables.find((tt) => tt.id === f.refTable)?.fields.map((tf) => (
                              <option key={tf.id} value={tf.id}>{tf.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {!isExporting && (
                  <button onClick={() => addField(t.id)} style={{ width: "100%", height: FOOTER_H, background: "transparent", border: "none", color: "#A9A3E0", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: "0 0 8px 8px" }}>
                    <Plus size={14} /> Add field
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "#292460", borderTop: "1px solid #453F85" }}>
          <button
            onClick={() => setStep(1)}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 8, padding: "8px 12px", fontWeight: 600, fontSize: 12 }}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            onClick={handleNextFromStep2}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 8, padding: "8px 16px", fontWeight: 800, fontSize: 12 }}
          >
            Proceed to Essay <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* ================= STEP 3 ================= */}
      {step === 3 && (
        <div style={{ flex: 1, width: "100%", overflowY: "auto", padding: "24px 12px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: "760px", background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 18, padding: "24px", boxSizing: "border-box", boxShadow: "0 12px 30px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ borderBottom: "1.5px solid #524C99", paddingBottom: 14 }}>
              <h2 style={{ fontSize: "clamp(17px, 2vw, 22px)", fontWeight: 800, marginBottom: 4, color: "#FFC857" }}>Step 3: Design Reflection</h2>
              <p style={{ fontSize: "clamp(12px, 1.2vw, 13px)", color: "#C4BFF0", lineHeight: 1.4 }}>Answer the reflection questions thoroughly based on your database design.</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Question 1 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#292460", padding: 16, borderRadius: 12, border: "1px solid #524C99" }}>
                <label style={{ fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700, color: "#F4F2FA", lineHeight: 1.4 }}>
                  1. Why is organising data into three related tables better than one table?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", resize: "vertical", padding: "10px", fontSize: 13, lineHeight: 1.4 }}
                  placeholder="Explain why separating tables reduces redundancy..."
                  value={explanations.separationReason}
                  onChange={(e) => setExplanations({ ...explanations, separationReason: e.target.value })}
                />
              </div>

              {/* Question 2 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#292460", padding: 16, borderRadius: 12, border: "1px solid #524C99" }}>
                <label style={{ fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700, color: "#F4F2FA", lineHeight: 1.4 }}>
                  2. How do the <b style={{ color: "#FFC857" }}>Primary Keys</b> keep your database organised and accurate?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", resize: "vertical", padding: "10px", fontSize: 13, lineHeight: 1.4 }}
                  placeholder="Explain the role of Primary Keys..."
                  value={explanations.primaryKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, primaryKeyRole: e.target.value })}
                />
              </div>

              {/* Question 3 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#292460", padding: 16, borderRadius: 12, border: "1px solid #524C99" }}>
                <label style={{ fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700, color: "#F4F2FA", lineHeight: 1.4 }}>
                  3. How do the <b style={{ color: "#5FD4C1" }}>Foreign Keys</b> help different tables work together?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", resize: "vertical", padding: "10px", fontSize: 13, lineHeight: 1.4 }}
                  placeholder="Explain how Foreign Keys establish relationships..."
                  value={explanations.foreignKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, foreignKeyRole: e.target.value })}
                />
              </div>

              {/* Question 4 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "#292460", padding: 16, borderRadius: 12, border: "1px solid #524C99" }}>
                <label style={{ fontSize: "clamp(12px, 1.3vw, 14px)", fontWeight: 700, color: "#F4F2FA", lineHeight: 1.4 }}>
                  4. If a Foreign Key were removed, what problems might occur?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", resize: "vertical", padding: "10px", fontSize: 13, lineHeight: 1.4 }}
                  placeholder="Explain issues like orphaned records or loss of integrity..."
                  value={explanations.fkRemovedProblems}
                  onChange={(e) => setExplanations({ ...explanations, fkRemovedProblems: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid #524C99", paddingTop: 16, gap: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 10, padding: "10px 16px", fontWeight: 600, fontSize: 13 }}
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                onClick={handleExportPDF}
                disabled={isExporting}
                style={{ display: "flex", alignItems: "center", gap: 6, background: "#5FD4C1", color: "#2E2A5C", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 800, fontSize: 14 }}
              >
                {isExporting ? "Generating PDF..." : "Download PDF & Submit 🚀"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SQL Modal */}
      {sqlOpen && (
        <div onClick={() => setSqlOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,12,40,0.72)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(600px, 100%)", maxHeight: "80vh", display: "flex", flexDirection: "column", background: "#292460", border: "1.5px solid #524C99", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1.5px solid #524C99" }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Your design as SQL</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={copySql} style={{ display: "flex", alignItems: "center", gap: 4, background: copied ? "#5FD4C1" : "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800 }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={() => setSqlOpen(false)} style={{ background: "transparent", border: "none", color: "#A9A3E0" }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <pre style={{ margin: 0, padding: 16, overflow: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, lineHeight: 1.6, color: "#E4E1F5", whiteSpace: "pre-wrap" }}>
              {buildSql() || "-- Add tables to view SQL code."}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}