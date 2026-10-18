import os
import re
import sys

def print_header(title):
    print("=" * 60)
    print(f" {title} ".center(60, "="))
    print("=" * 60)

# Regex patterns for Python bugs
PY_PATTERNS = [
    {
        "id": "PY-SECRET",
        "severity": "Critico",
        "pattern": re.compile(r'(?i)\b(secret|password|passwd|private_key|token|auth_key)\s*=\s*[\'"][a-zA-Z0-9_\-\.\+\/]{6,}[\'"]'),
        "description": "Credencial o secreto en texto plano detectado en el código."
    },
    {
        "id": "PY-SQL-INJECTION",
        "severity": "Critico",
        "pattern": re.compile(r'\.execute\(\s*(?:f["\']|["\'].*?%|["\'].*?\.format)'),
        "description": "Posible riesgo de inyección SQL. Evita concatenar o formatear variables en .execute(). Usa binding de parámetros."
    },
    {
        "id": "PY-MUTABLE-DEFAULT",
        "severity": "Medio",
        "pattern": re.compile(r'def\s+\w+\s*\(.*?\w+\s*=\s*(?:\[\]|\{\})\s*[,)]'),
        "description": "Argumento mutable por defecto (dict o list). Puede provocar comportamiento inesperado entre llamadas."
    },
    {
        "id": "PY-PRINT-STATEMENT",
        "severity": "Bajo",
        "pattern": re.compile(r'\bprint\s*\([^)]*\)'),
        "description": "Uso de print() detectado. Se recomienda utilizar el módulo de logs (logging) del sistema."
    }
]

# Regex patterns for TypeScript/React bugs
JS_PATTERNS = [
    {
        "id": "JS-DEBUGGER",
        "severity": "Critico",
        "pattern": re.compile(r'\bdebugger\b'),
        "description": "Instrucción debugger detectada en el código."
    },
    {
        "id": "JS-DANGEROUS-HTML",
        "severity": "Medio",
        "pattern": re.compile(r'dangerouslySetInnerHTML'),
        "description": "Uso de dangerouslySetInnerHTML detectado. Asegura que el contenido esté debidamente saneado."
    },
    {
        "id": "JS-HARDCODED-API",
        "severity": "Medio",
        "pattern": re.compile(r'https?://(?:localhost|127\.0\.0\.1|api\.)[a-zA-Z0-9_\-\.\:]+/api'),
        "description": "URL de API en duro. Utiliza variables de entorno para la URL base."
    },
    {
        "id": "JS-CONSOLE-LOG",
        "severity": "Bajo",
        "pattern": re.compile(r'\bconsole\.log\b'),
        "description": "Llamada residual a console.log. Limpia el log antes de enviar a producción."
    }
]

def scan_file(file_path, patterns):
    findings = []
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        
        for line_num, line in enumerate(lines, 1):
            # Ignorar líneas comentadas
            stripped = line.strip()
            if file_path.endswith((".py", ".bat")):
                if stripped.startswith("#"):
                    continue
            elif file_path.endswith((".ts", ".tsx", ".js", ".jsx", ".css")):
                if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
                    continue
            
            for item in patterns:
                if item["pattern"].search(line):
                    findings.append({
                        "line": line_num,
                        "code": item["id"],
                        "severity": item["severity"],
                        "description": item["description"],
                        "snippet": stripped
                    })
    except Exception as e:
        print(f"Error leyendo archivo {file_path}: {e}")
    return findings

def main():
    print_header("POS Retail VRNTAS - Agente Checador de Bugs Autónomo")
    
    # Raíz del proyecto: el padre de tools/ (6.3)
    script_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    backend_dir = os.path.join(script_root, "backend", "app")
    frontend_dir = os.path.join(script_root, "frontend", "src")
    
    all_findings = {}
    total_bugs = 0
    critical_bugs = 0
    
    # Scan Backend
    print(f"Escaneando directorio Backend: {backend_dir}...")
    if os.path.exists(backend_dir):
        for root, _, files in os.walk(backend_dir):
            for file in files:
                if file.endswith(".py"):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, script_root)
                    findings = scan_file(full_path, PY_PATTERNS)
                    if findings:
                        all_findings[rel_path] = findings
                        total_bugs += len(findings)
                        critical_bugs += sum(1 for f in findings if f["severity"] == "Critico")
                        
    # Scan Frontend
    print(f"Escaneando directorio Frontend: {frontend_dir}...")
    if os.path.exists(frontend_dir):
        for root, _, files in os.walk(frontend_dir):
            for file in files:
                if file.endswith((".ts", ".tsx", ".js", ".jsx")):
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, script_root)
                    findings = scan_file(full_path, JS_PATTERNS)
                    if findings:
                        all_findings[rel_path] = findings
                        total_bugs += len(findings)
                        critical_bugs += sum(1 for f in findings if f["severity"] == "Critico")

    # Generate Report Output
    report_path = os.path.join(script_root, "bug_report.md")
    
    print_header("Reporte de Auditoría de Bugs")
    if total_bugs == 0:
        print("[OK] ¡No se detectaron bugs ni antipatrones en el código!")
        # Remove old report if exists
        if os.path.exists(report_path):
            os.remove(report_path)
        sys.exit(0)
        
    print(f"[ALERTA] Se detectaron {total_bugs} problemas potenciales de código en {len(all_findings)} archivos.")
    print(f"          -> {critical_bugs} Críticos (Requieren corrección inmediata)")
    
    # Console output and Markdown writer
    with open(report_path, "w", encoding="utf-8") as rep:
        rep.write("# Reporte del Agente Checador de Bugs\n\n")
        rep.write(f"**Total de hallazgos:** {total_bugs} | **Críticos:** {critical_bugs}\n\n")
        rep.write("---\n\n")
        
        for file, findings in all_findings.items():
            print(f"\nArchivo: {file}")
            rep.write(f"### 📂 `{file}`\n")
            for f in findings:
                sev_label = f"[{f['severity'].upper()}]"
                print(f"  Línea {f['line']} | {sev_label} {f['code']}: {f['description']}")
                print(f"    Snippet: {f['snippet'][:80]}")
                
                rep.write(f"*   **Línea {f['line']}** - **{sev_label}** `{f['code']}`: {f['description']}\n")
                rep.write(f"    *Snippet:* `{f['snippet']}`\n")
            rep.write("\n")
            
    print(f"\n[INFORME] El reporte Markdown completo ha sido guardado en: {report_path}")
    
    # Exit 1 only if there are critical errors
    if critical_bugs > 0:
        print("[FALLO] Falló la verificación de seguridad por presencia de bugs Críticos.")
        sys.exit(1)
    else:
        print("[INFO] Verificación completada con advertencias menores.")
        sys.exit(0)

if __name__ == "__main__":
    main()
