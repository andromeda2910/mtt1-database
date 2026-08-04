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
    class: "",
    scenario: "School Library System"
  });

  const [tables, setTables] = useState(() => [
    {
      id: "t_students",
      name: "Students",
      x: 60,
      y: 60,
      fields: [
        { id: "f1", name: "ID", type: "Character", pk: true, fk: false, refTable: null, refField: null },
        { id: "f2", name: "Name", type: "Text", pk: false, fk: false, refTable: null, refField: null },
        { id: "f3", name: "Class", type: "Text", pk: false, fk: false, refTable: null, refField: null },
      ]
    },
    {
      id: "t_borrowing",
      name: "Borrowing",
      x: 350,
      y: 60,
      fields: [
        { id: "f4", name: "ID_Borrowing", type: "Character", pk: true, fk: false, refTable: null, refField: null },
        { id: "f5", name: "Books_ID", type: "Character", pk: false, fk: true, refTable: "t_books", refField: "f7" },
        { id: "f6", name: "Students_ID", type: "Character", pk: false, fk: true, refTable: "t_students", refField: "f1" },
      ]
    },
    {
      id: "t_books",
      name: "Books",
      x: 670,
      y: 60,
      fields: [
        { id: "f7", name: "Books_ID", type: "Character", pk: true, fk: false, refTable: null, refField: null },
        { id: "f8", name: "Book_Name", type: "Text", pk: false, fk: false, refTable: null, refField: null },
      ]
    }
  ]);

  const [selected, setSelected] = useState(null);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const counter = useRef(4);

  const [explanations, setExplanations] = useState({
    separationReason: "",
    primaryKeyRole: "",
    foreignKeyRole: "",
    dataRedundancy: ""
  });

  const updateTable = useCallback((id, fn) => {
    setTables((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));
  }, []);

  const addTable = () => {
    const n = counter.current++;
    const t = newTable(70 + ((n * 40) % 300), 70 + ((n * 40) % 200), n);
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
    updateTable(id, (t) => ({ ...t, fields: t.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) }));

  const startDrag = (e, id) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const t = tables.find((tt) => tt.id === id);
    dragRef.current = { id, offX: e.clientX - rect.left + canvas.scrollLeft - t.x, offY: e.clientY - rect.top + canvas.scrollTop - t.y };
    setSelected(id);
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", endDrag);
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

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
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
    if (!studentInfo.name.trim() || !studentInfo.class.trim()) {
      alert("⚠️ Please enter your Full Name and Class first!");
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
    if (!explanations.separationReason || !explanations.primaryKeyRole) {
      alert("⚠️ Please fill out at least the key reflection questions before submitting!");
      return;
    }

    setIsExporting(true);
    try {
      const exportContainer = document.createElement("div");
      exportContainer.style.position = "absolute";
      exportContainer.style.left = "-9999px";
      exportContainer.style.top = "0";
      exportContainer.style.width = "820px";
      exportContainer.style.backgroundColor = "#332E68";
      exportContainer.style.padding = "30px";
      exportContainer.style.fontFamily = "'Nunito Sans', sans-serif";
      exportContainer.style.color = "#F4F2FA";
      exportContainer.style.borderRadius = "12px";

      const titleEl = document.createElement("h3");
      titleEl.innerText = "Database Schema Layout";
      titleEl.style.marginBottom = "18px";
      titleEl.style.color = "#FFC857";
      titleEl.style.fontSize = "16px";
      exportContainer.appendChild(titleEl);

      const tablesGrid = document.createElement("div");
      tablesGrid.style.display = "flex";
      tablesGrid.style.flexWrap = "wrap";
      tablesGrid.style.gap = "18px";

      tables.forEach((t) => {
        const tableCard = document.createElement("div");
        tableCard.style.width = "240px";
        tableCard.style.backgroundColor = "#3A3570";
        tableCard.style.border = "2px solid #524C99";
        tableCard.style.borderRadius = "8px";
        tableCard.style.overflow = "hidden";
        tableCard.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";

        const header = document.createElement("div");
        header.style.backgroundColor = "#292460";
        header.style.padding = "10px 14px";
        header.style.fontWeight = "bold";
        header.style.fontSize = "14px";
        header.style.borderBottom = "1.5px solid #524C99";
        header.style.color = "#F4F2FA";
        header.innerText = t.name;
        tableCard.appendChild(header);

        t.fields.forEach((f) => {
          const fieldRow = document.createElement("div");
          fieldRow.style.padding = "8px 14px";
          fieldRow.style.borderBottom = "1px solid #453F85";
          fieldRow.style.display = "flex";
          fieldRow.style.justifyContent = "space-between";
          fieldRow.style.alignItems = "center";
          fieldRow.style.fontSize = "12px";

          const nameSpan = document.createElement("span");
          nameSpan.innerText = `${f.name} (${f.type})`;
          nameSpan.style.fontWeight = "600";
          fieldRow.appendChild(nameSpan);

          const badgesDiv = document.createElement("div");
          badgesDiv.style.display = "flex";
          badgesDiv.style.gap = "4px";

          if (f.pk) {
            const pkBadge = document.createElement("span");
            pkBadge.innerText = "PK";
            pkBadge.style.backgroundColor = "#FFC857";
            pkBadge.style.color = "#2E2A5C";
            pkBadge.style.padding = "2px 6px";
            pkBadge.style.borderRadius = "4px";
            pkBadge.style.fontSize = "10px";
            pkBadge.style.fontWeight = "bold";
            badgesDiv.appendChild(pkBadge);
          }
          if (f.fk) {
            const fkBadge = document.createElement("span");
            fkBadge.innerText = "FK";
            fkBadge.style.backgroundColor = "#5FD4C1";
            fkBadge.style.color = "#2E2A5C";
            fkBadge.style.padding = "2px 6px";
            fkBadge.style.borderRadius = "4px";
            fkBadge.style.fontSize = "10px";
            fkBadge.style.fontWeight = "bold";
            badgesDiv.appendChild(fkBadge);
          }
          fieldRow.appendChild(badgesDiv);
          tableCard.appendChild(fieldRow);
        });

        tablesGrid.appendChild(tableCard);
      });

      exportContainer.appendChild(tablesGrid);

      const relTitle = document.createElement("h4");
      relTitle.innerText = "Foreign Key Relations Mapping:";
      relTitle.style.marginTop = "22px";
      relTitle.style.marginBottom = "8px";
      relTitle.style.color = "#5FD4C1";
      relTitle.style.fontSize = "14px";
      exportContainer.appendChild(relTitle);

      const relList = document.createElement("ul");
      relList.style.paddingLeft = "20px";
      relList.style.fontSize = "12px";
      relList.style.color = "#D4D0F0";

      let hasRel = false;
      tables.forEach((t) => {
        t.fields.forEach((f) => {
          if (f.fk && f.refTable && f.refField) {
            const targetT = tables.find((tt) => tt.id === f.refTable);
            const targetF = targetT?.fields.find((tf) => tf.id === f.refField);
            if (targetT && targetF) {
              hasRel = true;
              const li = document.createElement("li");
              li.innerText = `${t.name}.${f.name} ──> references ──> ${targetT.name}.${targetF.name}`;
              li.style.marginBottom = "4px";
              relList.appendChild(li);
            }
          }
        });
      });

      if (!hasRel) {
        const li = document.createElement("li");
        li.innerText = "No foreign key relations mapped yet.";
        relList.appendChild(li);
      }
      exportContainer.appendChild(relList);

      document.body.appendChild(exportContainer);

      const canvasImage = await html2canvas(exportContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#332E68"
      });

      document.body.removeChild(exportContainer);

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

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(46, 42, 92);
      doc.text("Database Schema Diagram & Relations:", margin, y);
      y += 6;

      const imgData = canvasImage.toDataURL("image/png");
      const imgWidth = pageWidth - (margin * 2);
      const imgHeight = (canvasImage.height * imgWidth) / canvasImage.width;
      
      const maxHeight = 100;
      let finalImgHeight = imgHeight;
      let finalImgWidth = imgWidth;
      if (imgHeight > maxHeight) {
        finalImgHeight = maxHeight;
        finalImgWidth = (canvasImage.width * maxHeight) / canvasImage.height;
      }

      doc.addImage(imgData, "PNG", margin, y, finalImgWidth, finalImgHeight);
      y += finalImgHeight + 10;

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

      addAnswerSection("1. Table Separation Reason:", explanations.separationReason);
      addAnswerSection("2. Primary Key (PK) Role:", explanations.primaryKeyRole);
      addAnswerSection("3. Foreign Key (FK) Role:", explanations.foreignKeyRole);
      addAnswerSection("4. Data Redundancy Prevention:", explanations.dataRedundancy);

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
      `}</style>

      {/* TOP HEADER & STEP INDICATOR */}
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

      {/* ================= STEP 1: IDENTITY & SCENARIO ================= */}
      {step === 1 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 520, background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 16, padding: 30, boxShadow: "0 10px 25px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 5 }}>Welcome to Practical Mid Term Exam Grade 9</h2>
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
                <input
                  type="text"
                  placeholder="e.g., Clive Staple Lewis, Thomas Alva Edison"
                  style={{ width: "100%" }}
                  value={studentInfo.class}
                  onChange={(e) => setStudentInfo({ ...studentInfo, class: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 800, color: "#A9A3E0", marginBottom: 6, textTransform: "uppercase" }}>Database Scenario</label>
                <select
                  style={{ width: "100%" }}
                  value={studentInfo.scenario}
                  onChange={(e) => setStudentInfo({ ...studentInfo, scenario: e.target.value })}
                >
                  <option value="School Library System">School Library System</option>
                  <option value="Online Bookstore">Online Bookstore</option>
                  <option value="School Course Enrollment">School Course Enrollment</option>
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

      {/* ================= STEP 2: CANVAS DESIGNER ================= */}
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
            onMouseDown={() => setSelected(null)}
            style={{
              flex: 1,
              overflow: "auto",
              position: "relative",
              backgroundImage: "linear-gradient(#3A3570 1px, transparent 1px), linear-gradient(90deg, #3A3570 1px, transparent 1px)",
              backgroundSize: "26px 26px",
              backgroundColor: "#332E68",
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
                    onMouseDown={(e) => startDrag(e, t.id)}
                    style={{ height: HEADER_H, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", cursor: "grab", borderBottom: "1.5px solid #524C99", background: "#292460", borderRadius: "8px 8px 0 0" }}
                  >
                    <input
                      value={t.name}
                      onChange={(e) => updateTable(t.id, (tt) => ({ ...tt, name: e.target.value.replace(/\s+/g, "_") }))}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ flex: 1, fontWeight: 800, fontSize: 14, background: "transparent", border: "none", padding: "3px 4px" }}
                    />
                    <button onMouseDown={(e) => e.stopPropagation()} onClick={() => removeTable(t.id)} style={{ background: "transparent", border: "none", color: "#F08A6C", padding: 2 }} title="Delete table">
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
                            <select value={f.refTable || ""} onChange={(e) => editField(t.id, f.id, { refTable: e.target.value || null, refField: null })} style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}>
                              <option value="">which table?</option>
                              {tables.filter((tt) => tt.id !== t.id).map((tt) => (
                                <option key={tt.id} value={tt.id}>{tt.name}</option>
                              ))}
                            </select>
                            <select value={f.refField || ""} onChange={(e) => editField(t.id, f.id, { refField: e.target.value || null })} disabled={!f.refTable} style={{ flex: 1, fontSize: 11, padding: "5px 3px", borderColor: "#5FD4C1" }}>
                              <option value="">which field?</option>
                              {tables.find((tt) => tt.id === f.refTable)?.fields.map((tf) => (
                                <option key={tf.id} value={tf.id}>{tf.name}</option>
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

      {/* ================= STEP 3: EXPLANATION QUESTIONS ================= */}
      {step === 3 && (
        <div style={{ flex: 1, overflowY: "auto", padding: "40px 20px" }}>
          <div 
            style={{ 
              width: "100%", 
              maxWidth: 800, 
              margin: "0 auto",
              background: "#3A3570", 
              border: "1.5px solid #524C99", 
              borderRadius: 16, 
              padding: "32px", 
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
              display: "flex", 
              flexDirection: "column", 
              gap: 24 
            }}
          >
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: "#FFC857" }}>
                Step 3: Design Explanation & Reflection
              </h2>
              <p style={{ fontSize: 14, color: "#A9A3E0", marginBottom: 10 }}>
                Please explain the database logic you have designed in Step 2.
              </p>
              <div style={{ height: "1px", background: "#524C99", width: "100%" }}></div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Question 1 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 14, fontWeight: 700, lineHeight: "1.5" }}>
                  1. Why must data in this scenario be separated into multiple distinct tables rather than combined into one giant table?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", padding: "12px", fontSize: "14px", lineHeight: "1.5" }}
                  placeholder="Your explanation..."
                  value={explanations.separationReason}
                  onChange={(e) => setExplanations({ ...explanations, separationReason: e.target.value })}
                />
              </div>

              {/* Question 2 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 14, fontWeight: 700, lineHeight: "1.5" }}>
                  2. What is the role of the <span style={{ color: "#FFC857" }}>Primary Key (PK)</span> that you assigned in your main table?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", padding: "12px", fontSize: "14px", lineHeight: "1.5" }}
                  placeholder="Your explanation..."
                  value={explanations.primaryKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, primaryKeyRole: e.target.value })}
                />
              </div>

              {/* Question 3 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 14, fontWeight: 700, lineHeight: "1.5" }}>
                  3. How does a <span style={{ color: "#5FD4C1" }}>Foreign Key (FK)</span> help bridge a transaction table to a reference table?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", padding: "12px", fontSize: "14px", lineHeight: "1.5" }}
                  placeholder="Your explanation..."
                  value={explanations.foreignKeyRole}
                  onChange={(e) => setExplanations({ ...explanations, foreignKeyRole: e.target.value })}
                />
              </div>

              {/* Question 4 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontSize: 14, fontWeight: 700, lineHeight: "1.5" }}>
                  4. How does your design prevent the repetition of duplicate data (<i style={{ color: "#A9A3E0" }}>Data Redundancy</i>)?
                </label>
                <textarea
                  rows={3}
                  style={{ width: "100%", padding: "12px", fontSize: "14px", lineHeight: "1.5" }}
                  placeholder="Your explanation..."
                  value={explanations.dataRedundancy}
                  onChange={(e) => setExplanations({ ...explanations, dataRedundancy: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1.5px solid #524C99", paddingTop: 24, marginTop: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: "#F4F2FA", border: "1.5px solid #524C99", borderRadius: 8, padding: "10px 16px", fontWeight: 600, fontSize: 14 }}
              >
                <ArrowLeft size={18} /> Back to Design
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

      {/* ================= SQL MODAL ================= */}
      {sqlOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#3A3570", border: "1.5px solid #524C99", borderRadius: 12, padding: 24, width: "90%", maxWidth: 600, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#FFC857" }}>Generated SQL Schema</h3>
              <button onClick={() => setSqlOpen(false)} style={{ background: "transparent", border: "none", color: "#F4F2FA" }}><X size={18} /></button>
            </div>
            <pre style={{ background: "#292460", padding: 14, borderRadius: 8, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#5FD4C1", overflowX: "auto", maxHeight: 300 }}>
              {buildSql()}
            </pre>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={copySql} style={{ display: "flex", alignItems: "center", gap: 6, background: "#FFC857", color: "#2E2A5C", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 800, fontSize: 12 }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied!" : "Copy SQL"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}