import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import {
  Avatar,
  Badge,
  Button,
  Card,
  Corners,
  FilterChip,
  Input,
  Kbd,
  Modal,
  Pagination,
  Segmented,
  Select,
  Toast,
  Toggle,
} from "..";

describe("Button (Industry)", () => {
  it("el primario usa el acento y texto claro sobre acento", () => {
    render(<Button>Cobrar</Button>);
    const cls = screen.getByRole("button", { name: "Cobrar" }).className;
    expect(cls).toContain("bg-accent");
    expect(cls).toContain("text-on-acc");
    expect(cls).not.toMatch(/rounded/);
  });

  it("frame pinta las 4 marcas de registro y la clase blueprint", () => {
    const { container } = render(<Button frame>Cobrar</Button>);
    expect(screen.getByRole("button").className).toContain("blueprint");
    expect(container.querySelectorAll("i.corner")).toHaveLength(4);
  });

  it("sin frame no hay marcas", () => {
    const { container } = render(<Button>Aceptar</Button>);
    expect(container.querySelectorAll("i.corner")).toHaveLength(0);
  });

  it("deshabilitado baja al 45 % y no dispara onClick", () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Pagar</Button>);
    const button = screen.getByRole("button", { name: "Pagar" });
    expect(button.className).toContain("opacity-45");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("el tamaño md conserva el objetivo táctil de 44 px", () => {
    render(<Button>OK</Button>);
    expect(screen.getByRole("button").className).toContain("min-h-11");
  });
});

describe("Segmented", () => {
  function Demo({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState("efectivo");
    return (
      <Segmented
        aria-label="Método de pago"
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
        options={[
          { label: "Efectivo", value: "efectivo" },
          { label: "Tarjeta", value: "tarjeta" },
          { label: "Transferencia", value: "transferencia", disabled: true },
        ]}
        value={value}
      />
    );
  }

  it("es un radiogroup con la opción activa marcada", () => {
    render(<Demo />);
    expect(screen.getByRole("radiogroup", { name: "Método de pago" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Efectivo" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("radio", { name: "Tarjeta" }).getAttribute("aria-checked")).toBe("false");
  });

  it("solo la opción activa está en el orden de tabulación", () => {
    render(<Demo />);
    expect(screen.getByRole("radio", { name: "Efectivo" }).tabIndex).toBe(0);
    expect(screen.getByRole("radio", { name: "Tarjeta" }).tabIndex).toBe(-1);
  });

  it("las flechas cambian la selección y saltan las opciones deshabilitadas", () => {
    const onChange = vi.fn();
    render(<Demo onChange={onChange} />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("tarjeta");
    // desde "tarjeta" la siguiente habilitada vuelve a "efectivo" (transferencia está deshabilitada)
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("efectivo");
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("tarjeta");
  });

  it("el clic selecciona; una opción deshabilitada no", () => {
    const onChange = vi.fn();
    render(<Demo onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Tarjeta" }));
    expect(onChange).toHaveBeenCalledWith("tarjeta");
    onChange.mockClear();
    fireEvent.click(screen.getByRole("radio", { name: "Transferencia" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it.each([
    ["success", "bg-ok-tint"],
    ["warning", "bg-warn-tint"],
    ["danger", "bg-bad-tint"],
    ["accent", "bg-acc-tint"],
    ["info", "bg-acc-tint"], // `info` se conserva por compatibilidad y se muestra como acento
    ["neutral", "bg-line-soft"],
  ] as const)("tono %s usa %s", (tone, expected) => {
    render(<Badge tone={tone}>Etiqueta</Badge>);
    expect(screen.getByText("Etiqueta").className).toContain(expected);
  });

  it("outline lleva borde de acento y es de esquinas rectas", () => {
    render(<Badge tone="outline">Borde</Badge>);
    const cls = screen.getByText("Borde").className;
    expect(cls).toContain("border-accent");
    expect(cls).not.toMatch(/rounded/);
  });
});

describe("Card y Corners", () => {
  it("la tarjeta es de línea fina, sin relleno ni esquinas redondeadas", () => {
    render(<Card data-testid="c">Contenido</Card>);
    const cls = screen.getByTestId("c").className;
    expect(cls).toContain("border-divider");
    expect(cls).not.toMatch(/rounded|shadow|bg-/);
  });

  it("frame agrega las 4 marcas, decorativas para lectores de pantalla", () => {
    const { container } = render(<Card frame>Contenido</Card>);
    const marks = container.querySelectorAll("i.corner");
    expect(marks).toHaveLength(4);
    marks.forEach((m) => expect(m.getAttribute("aria-hidden")).toBe("true"));
  });

  it("Corners aislado renderiza tl, tr, bl y br", () => {
    const { container } = render(<div className="blueprint"><Corners /></div>);
    for (const pos of ["tl", "tr", "bl", "br"]) expect(container.querySelector(`i.corner.${pos}`)).toBeTruthy();
  });
});

describe("Formularios", () => {
  it("Input: etiqueta asociada, borde de 3:1 y mensaje de error", () => {
    render(<Input error="Campo obligatorio" label="Usuario" name="usuario" />);
    const input = screen.getByLabelText(/Usuario/);
    expect(input.className).toContain("border-field-border");
    expect(input.className).toContain("border-bad");
    expect(screen.getByText("Campo obligatorio").className).toContain("text-bad");
  });

  it("Input enlaza el error con aria-invalid y aria-describedby", () => {
    render(<Input error="Campo obligatorio" label="Usuario" name="usuario" />);
    const input = screen.getByLabelText(/Usuario/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const errorId = input.getAttribute("aria-describedby");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId as string)?.textContent).toBe("Campo obligatorio");
  });

  it("Input sin error no declara aria-invalid", () => {
    render(<Input label="Nombre" name="nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("Input usa 16 px (sin zoom en iOS) y objetivo de 44 px", () => {
    render(<Input label="Nombre" name="nombre" />);
    const cls = screen.getByLabelText("Nombre").className;
    expect(cls).toContain("text-base");
    expect(cls).toContain("min-h-11");
  });

  it("Select muestra placeholder, opciones y error", () => {
    render(<Select error="Elige una" label="Categoría" name="cat" options={[{ label: "Herramientas", value: 1 }]} placeholder="Selecciona…" />);
    const select = screen.getByLabelText(/Categoría/);
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Herramientas" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Selecciona…" })).toBeTruthy();
    expect(screen.getByText("Elige una")).toBeTruthy();
  });

  it("Toggle es un switch accesible que notifica el cambio", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} label="Permite fracciones" onChange={onChange} />);
    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe("Otros componentes", () => {
  it("Kbd renderiza un elemento kbd con borde fino", () => {
    render(<Kbd>F5</Kbd>);
    const el = screen.getByText("F5");
    expect(el.tagName).toBe("KBD");
    expect(el.className).toContain("border-divider");
  });

  it("FilterChip indica el estado con aria-pressed", () => {
    render(<FilterChip active label="Todos" onClick={() => undefined} />);
    expect(screen.getByRole("button", { name: "Todos" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Avatar muestra las iniciales con las esquinas rectas", () => {
    render(<Avatar name="Laura Méndez" />);
    const el = screen.getByTitle("Laura Méndez");
    expect(el.textContent).toBe("LM");
    expect(el.className).not.toMatch(/rounded/);
  });

  it("Toast es un status con el borde del tono", () => {
    render(<Toast tone="danger">No se pudo guardar</Toast>);
    const el = screen.getByRole("status");
    expect(el.className).toContain("border-bad");
  });

  it("Pagination marca la página actual", () => {
    render(<Pagination onPageChange={() => undefined} page={3} totalPages={9} />);
    expect(screen.getByRole("button", { name: "3" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "2" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("Modal (Industry)", () => {
  it("es un diálogo modal con marcas de registro y cierra con Esc", () => {
    const onClose = vi.fn();
    const { baseElement } = render(
      <MemoryRouter>
        <Modal onClose={onClose} open title="Cobrar venta">
          <p>Contenido</p>
        </Modal>
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog", { name: "Cobrar venta" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(baseElement.querySelectorAll("[role=dialog] i.corner")).toHaveLength(4);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cerrado no renderiza nada", () => {
    render(<Modal onClose={() => undefined} open={false} title="Oculto"><p>x</p></Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
