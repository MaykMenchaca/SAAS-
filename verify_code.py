import os
import sys
import subprocess

def print_header(title):
    print("=" * 60)
    print(f" {title} ".center(60, "="))
    print("=" * 60)

def run_command(cmd, cwd, env=None):
    print(f"\nRunning command: {' '.join(cmd)}")
    print(f"In directory: {cwd}\n")
    try:
        # Use shell=True for windows to execute npm/npx/pytest properly if needed,
        # but let's try direct execution first.
        result = subprocess.run(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=True)
        print("--- STDOUT ---")
        print(result.stdout)
        if result.stderr:
            print("--- STDERR ---")
            print(result.stderr)
        print(f"Exit Code: {result.returncode}")
        return result.returncode == 0, result.stdout, result.stderr
    except Exception as e:
        print(f"Failed to execute command: {e}")
        return False, "", str(e)

def main():
    print_header("POS Retail VRNTAS - Agente de Verificación de Código")
    
    script_root = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(script_root, "backend")
    frontend_dir = os.path.join(script_root, "frontend")
    
    # Python executable path in venv
    python_exe = os.path.join(backend_dir, "venv", "Scripts", "python.exe")
    if not os.path.exists(python_exe):
        python_exe = "python" # fallback to global python
        
    failures = []

    # 1. Backend Static Compilation Check
    print_header("Paso 1: Compilación Estática Backend")
    cmd_compile = [python_exe, "-m", "compileall", "app"]
    success, stdout, stderr = run_command(cmd_compile, backend_dir)
    if not success:
        failures.append("Backend Compilation Check")
    else:
        # If there are any listing/compiling errors in compileall stdout, count as failure
        if "*** Error" in stdout or "*** Error" in stderr:
            print("[!] Se encontraron errores de compilación sintáctica.")
            failures.append("Backend Compilation Syntax Errors")
        else:
            print("[OK] Compilación estática exitosa.")

    # 2. Backend Pytest Suite
    print_header("Paso 2: Suite de Pruebas Pytest")
    # Execute pytest using python -m pytest to avoid path resolution issues
    cmd_pytest = [python_exe, "-m", "pytest"]
    success, stdout, stderr = run_command(cmd_pytest, backend_dir)
    if not success:
        failures.append("Backend Unit/E2E Tests (pytest)")
    else:
        print("[OK] Todas las pruebas unitarias/E2E pasaron con éxito.")

    # 3. Frontend TypeScript checking (tsc)
    print_header("Paso 3: Verificación de Tipos TypeScript (tsc)")
    cmd_tsc = ["npx", "tsc", "--noEmit"]
    success, stdout, stderr = run_command(cmd_tsc, frontend_dir)
    if not success:
        failures.append("Frontend TypeScript type check (tsc)")
    else:
        print("[OK] Verificación de tipos de TypeScript exitosa.")

    # 4. Frontend Production Build Check
    print_header("Paso 4: Verificación de Compilación de Producción Frontend")
    cmd_build = ["npm", "run", "build"]
    success, stdout, stderr = run_command(cmd_build, frontend_dir)
    if not success:
        failures.append("Frontend Production Build (npm run build)")
    else:
        print("[OK] Compilación de producción de Vite exitosa.")

    # Summary Report
    print_header("Reporte Final del Agente de Código")
    if failures:
        print(f"[ERROR] Se encontraron fallos en las siguientes verificaciones:")
        for fail in failures:
            print(f" - {fail}")
        sys.exit(1)
    else:
        print("[COMPLETO] El código está limpio de errores sintácticos, de tipo y de pruebas.")
        sys.exit(0)

if __name__ == "__main__":
    main()
