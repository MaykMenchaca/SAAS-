import os
import re
import sys

def print_header(title):
    print("=" * 60)
    print(f" {title} ".center(60, "="))
    print("=" * 60)

# Exact tokens from MASTER.md to verify in index.css
EXPECTED_CSS_TOKENS = {
    "--color-primary": "oklch(0.69 0.16 235)",
    "--color-primary-hover": "oklch(0.59 0.16 235)",
    "--color-success": "oklch(0.59 0.13 165)",
    "--color-warning": "oklch(0.65 0.16 55)",
    "--color-danger": "oklch(0.58 0.21 28)",
    "--color-info": "oklch(0.76 0.13 230)",
    "--color-neutral-bg": "oklch(0.98 0.005 250)",
    "--color-neutral-surface": "oklch(1 0 0)",
    "--color-neutral-surface-raised": "oklch(0.96 0.005 250)",
    "--color-neutral-border": "oklch(0.91 0.005 250)",
    "--color-neutral-border-strong": "oklch(0.84 0.008 250)",
    "--color-neutral-text-primary": "oklch(0.21 0.04 260)",
    "--color-neutral-text-secondary": "oklch(0.49 0.02 260)",
    "--color-neutral-text-muted": "oklch(0.49 0.02 260)",
    "--color-neutral-decorative": "oklch(0.71 0.01 250)",
    "--color-sidebar-bg": "oklch(0.25 0.03 260)",
    "--color-sidebar-text": "oklch(0.69 0.03 240)",
    "--color-pos-total-bg": "oklch(0.25 0.03 260)",
    "--font-sans": '"Inter", system-ui, -apple-system, sans-serif',
    "--font-mono": '"JetBrains Mono", "Fira Code", monospace',
    "--radius-sm": "6px",
    "--radius-md": "8px",
    "--radius-lg": "12px",
    "--spacing-xs": "4px",
    "--spacing-sm": "8px",
    "--spacing-md": "16px",
    "--spacing-lg": "24px",
    "--spacing-xl": "32px",
    "--spacing-section": "48px"
}

def clean_css_value(val):
    # normalize spaces and remove semi-colons
    val = val.strip().rstrip(';').replace('  ', ' ')
    # Normalize double quotes to single quotes or vice-versa to prevent match errors
    val = val.replace("'", '"')
    return val

def check_index_css(css_path):
    print(f"\nChecking design tokens in: {css_path}")
    if not os.path.exists(css_path):
        print(f"[!] index.css not found at {css_path}")
        return False, ["index.css missing"]
    
    with open(css_path, 'r', encoding='utf-8') as f:
        content = f.read()

    errors = []
    
    # Parse tokens using simple regex
    for token, expected_val in EXPECTED_CSS_TOKENS.items():
        # Look for e.g. --color-primary: oklch(0.69 0.16 235);
        pattern = re.escape(token) + r"\s*:\s*([^;\n\r}]+)"
        matches = re.findall(pattern, content)
        if not matches:
            errors.append(f"Token '{token}' is missing in index.css")
        else:
            # We check if at least one match has the expected value
            found = False
            for match in matches:
                cleaned_match = clean_css_value(match)
                cleaned_expected = clean_css_value(expected_val)
                if cleaned_match == cleaned_expected:
                    found = True
                    break
            if not found:
                errors.append(f"Token '{token}' has invalid value(s). Expected '{expected_val}', found values: {matches}")
                
    if not errors:
        print("[OK] All required design tokens are correctly defined in index.css!")
        return True, []
    else:
        print(f"[!] Found {len(errors)} token errors.")
        return False, errors

def scan_file_for_antipatrons(file_path):
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
        
    file_errors = []
    
    # Regexes for patterns
    # 1. Hardcoded HEX colors like bg-[#ff0000] or border-[#eaeaea] or styles color: '#ff00'
    # excluding variables declarations/imports
    hex_pattern = re.compile(r'(?:bg|text|border|accent|ring|fill|stroke|outline|shadow|from|to|via)-\[(#[0-9a-fA-F]{3,8})\]')
    # 2. Hardcoded rgb/rgba/oklch colors in classes like text-[rgb(0,0,0)] or text-[oklch(...)]
    rgb_oklch_pattern = re.compile(r'(?:bg|text|border|accent|ring|fill|stroke|outline|shadow|from|to|via)-\[(rgb|rgba|oklch)\([^)]+\)\]')
    # 3. transition-all class
    transition_all_pattern = re.compile(r'\btransition-all\b')
    # 4. cursor-pointer manual class on buttons
    # Pattern: a <button or <Button with className containing cursor-pointer
    button_cursor_pattern = re.compile(r'<(?:button|Button)\b[^>]*className=["\'][^"\']*\bcursor-pointer\b[^"\']*["\']')
    # 5. ease-in in transitions / entries
    # Check for transition classes that couple transition with ease-in
    ease_in_pattern = re.compile(r'\b(?:transition|duration)-\w*\s+[^"\']*ease-in\b|\b(?:transition|duration)\s+[^"\']*ease-in\b')
    # 6. scale(0) or scale-0 entry values instead of minimum scale(0.95)
    # Check for scale-0 or scale(0) in code, scale(0) usually in motion config/JSX style
    scale_zero_pattern = re.compile(r'\b(?:scale-0\b|scale\(0\))')

    for line_num, line in enumerate(lines, 1):
        # Skip comments
        stripped = line.strip()
        if stripped.startswith("//") or stripped.startswith("/*") or stripped.startswith("*"):
            continue
            
        # 1. Hardcoded Hex Colors
        for m in hex_pattern.findall(line):
            file_errors.append((line_num, "Hardcoded HEX color", f"Found '{m}' directly in class name. Use a design token instead."))
            
        # 2. Hardcoded RGB/OKLCH Colors
        for m in rgb_oklch_pattern.findall(line):
            file_errors.append((line_num, f"Hardcoded {m.upper()} color", f"Found raw '{m}' color in class name. Use a design token instead."))
            
        # 3. transition-all
        if transition_all_pattern.search(line):
            file_errors.append((line_num, "Forbidden 'transition-all'", "Avoid 'transition-all' for performance. Specify transition properties explicitly."))
            
        # 4. Manual cursor-pointer on button
        if button_cursor_pattern.search(line):
            file_errors.append((line_num, "Redundant 'cursor-pointer'", "Do not manual add 'cursor-pointer' to buttons. The global style handles this automatically."))

        # 5. ease-in on transitions
        if ease_in_pattern.search(line):
            file_errors.append((line_num, "Entry Transition 'ease-in' warning", "Avoid 'ease-in' for entry transitions. Use ease-out or custom curves (--ease-out-strong)."))
            
        # 6. scale(0) on entries
        if scale_zero_pattern.search(line):
            file_errors.append((line_num, "Forbidden 'scale(0)' scale-in value", "Entry animations should start at a minimum scale of 0.95, not 0."))

    return file_errors

def check_frontend_codebase(src_dir):
    print(f"\nScanning codebase for design anti-patterns in: {src_dir}")
    all_violations = {}
    total_violations_count = 0
    
    for root, dirs, files in os.walk(src_dir):
        # Skip node_modules and assets
        if "node_modules" in root or "assets" in root:
            continue
        for file in files:
            if file.endswith(('.tsx', '.ts', '.jsx', '.css')):
                # skip index.css itself for anti-pattern scans
                if file == "index.css":
                    continue
                file_path = os.path.join(root, file)
                errors = scan_file_for_antipatrons(file_path)
                if errors:
                    rel_path = os.path.relpath(file_path, src_dir)
                    all_violations[rel_path] = errors
                    total_violations_count += len(errors)
                    
    if total_violations_count == 0:
        print("[OK] No styling anti-patterns found in the frontend files!")
    else:
        print(f"[!] Found {total_violations_count} styling anti-pattern violations in {len(all_violations)} files:")
        for rel_path, errors in all_violations.items():
            print(f"\nFile: {rel_path}")
            for line, category, msg in errors:
                print(f"  Line {line} | {category}: {msg}")
                
    return total_violations_count, all_violations

def main():
    print_header("POS Retail VRNTAS - Agente de Verificación Estática de Diseño")
    
    # Raíz del proyecto: el padre de tools/ (6.3)
    script_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    css_path = os.path.join(script_root, "frontend", "src", "index.css")
    src_dir = os.path.join(script_root, "frontend", "src")
    
    css_ok, css_errors = check_index_css(css_path)
    violations_count, code_violations = check_frontend_codebase(src_dir)
    
    print_header("Reporte Final de Diseño Estático")
    success = True
    
    if not css_ok:
        print("[FALLO] El archivo index.css no cumple con los tokens oficiales:")
        for err in css_errors:
            print(f"  - {err}")
        success = False
        
    if violations_count > 0:
        print(f"[ALERTA] Se encontraron {violations_count} desviaciones de diseño en el código frontend.")
        # We don't fail the whole execution if there are code style warnings,
        # but let's exit with 1 if there are errors in index.css (tokens) or major violations.
        # However, for this agent, let's report the exact status code.
        # Let's consider 0 violations a perfect score. If there are index.css errors, we fail.
        if not css_ok:
            sys.exit(1)
        else:
            print("[INFO] index.css es válido, pero el código fuente tiene desviaciones estéticas.")
            # Exit with 0 since it is a code analysis report with suggestions
            sys.exit(0)
    else:
        if css_ok:
            print("[COMPLETO] Diseño 100% conforme con MASTER.md!")
            sys.exit(0)
        else:
            sys.exit(1)

if __name__ == "__main__":
    main()
