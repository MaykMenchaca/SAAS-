/**
 * Catálogo de componentes Industry — SOLO DESARROLLO (ruta /_ui, no se incluye en el build de producción).
 * Sirve para revisar cada componente y variante en claro y oscuro contra docs/rediseno-2026-10/diseno/.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Banknote, CreditCard, Landmark, Moon, Plus, Search, Sun, Trash2 } from "lucide-react";

import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FilterChip,
  Input,
  Kbd,
  Modal,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  SkeletonKPI,
  SkeletonTable,
  Table,
  tableCellClass,
  tableHeadClass,
  tableNumClass,
  tableRowClass,
  Toast,
  Toggle,
  Tooltip,
} from "../components/ui";
import { useThemeStore } from "../stores/theme-store";

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="grid gap-4 border-t border-divider pt-6">
      <h2 className="text-2xl">{title}</h2>
      {children}
    </section>
  );
}

const row = "flex flex-wrap items-center gap-3";

export function UiCatalogPage() {
  const { theme, toggleTheme } = useThemeStore();
  const [modal, setModal] = useState(false);
  const [on, setOn] = useState(true);
  const [method, setMethod] = useState("efectivo");
  const [role, setRole] = useState("admin");
  const [chip, setChip] = useState("Todos");
  const [page, setPage] = useState(3);

  return (
    <main className="mx-auto grid max-w-5xl gap-8 p-6">
      <PageHeader
        actions={
          <Button onClick={toggleTheme} variant="secondary">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            Tema {theme === "dark" ? "claro" : "oscuro"}
          </Button>
        }
        subtitle="Componentes del sistema Industry. Solo desarrollo."
        title="Catálogo de componentes"
      />

      <Section title="Botones">
        <div className={row}>
          <Button>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Fantasma</Button>
          <Button variant="danger">Peligro</Button>
          <Button aria-label="Quitar" variant="icon"><Trash2 size={16} /></Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className={row}>
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
          <Button icon={<Plus size={16} />}>Con icono</Button>
          <Button frame size="lg">Cobrar <Kbd className="border-on-acc text-on-acc">F5</Kbd></Button>
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Usuario" placeholder="Ingresa tu usuario" />
          <Input icon={<Search size={16} />} label="Con icono" placeholder="Buscar…" />
          <Input defaultValue="abc" error="Este campo no es válido" label="Con error" />
          <Input disabled label="Deshabilitado" value="No editable" readOnly />
          <Select label="Categoría" options={[{ label: "Herramientas", value: 1 }, { label: "Fijación", value: 2 }]} placeholder="Selecciona…" />
          <Select error="Elige una opción" label="Con error" options={[{ label: "Uno", value: 1 }]} />
        </div>
        <div className={row}>
          <Toggle checked={on} label="Permite fracciones" onChange={setOn} />
          <Toggle checked={false} disabled label="Deshabilitado" onChange={() => undefined} />
        </div>
      </Section>

      <Section title="Selector segmentado">
        <div className="grid gap-4">
          <Segmented
            aria-label="Método de pago"
            fullWidth
            onChange={setMethod}
            options={[
              { icon: <Banknote size={16} />, label: "Efectivo", value: "efectivo" },
              { icon: <CreditCard size={16} />, label: "Tarjeta", value: "tarjeta" },
              { icon: <Landmark size={16} />, label: "Transferencia", value: "transferencia" },
            ]}
            value={method}
          />
          <Segmented
            aria-label="Ver como"
            onChange={setRole}
            options={[{ label: "Admin", value: "admin" }, { label: "Gerente", value: "gerente" }, { label: "Cajero", value: "cajero" }]}
            size="sm"
            value={role}
          />
          <div className={row}>
            {["Todos", "Herramientas", "Fijación", "Eléctrico"].map((c) => (
              <FilterChip active={chip === c} key={c} label={c} onClick={() => setChip(c)} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Etiquetas y atajos">
        <div className={row}>
          <Badge>Neutral</Badge>
          <Badge tone="accent">Acento</Badge>
          <Badge tone="success">Abierta</Badge>
          <Badge tone="warning">Stock bajo</Badge>
          <Badge tone="danger">Agotado</Badge>
          <Badge tone="outline">Contorno</Badge>
          <Badge dot tone="success">Con punto</Badge>
        </div>
        <div className={row}>
          <Kbd>F2</Kbd><Kbd>F5</Kbd><Kbd>Ctrl K</Kbd><Kbd>Esc</Kbd>
          <Avatar name="Laura Méndez" />
          <Avatar name="Jorge Pérez" size="sm" />
          <Tooltip content="Ayuda contextual"><Button variant="secondary">Pasa el cursor</Button></Tooltip>
        </div>
      </Section>

      <Section title="Paneles">
        <div className="grid gap-6 sm:grid-cols-2">
          <Card className="p-4">Panel de línea fina, sin relleno.</Card>
          <Card className="p-4" frame>Panel con marcas de registro «+».</Card>
        </div>
      </Section>

      <Section title="Tabla">
        <Table>
          <thead>
            <tr>
              <th className={tableHeadClass}>Folio</th>
              <th className={tableHeadClass}>Cajero</th>
              <th className={`${tableHeadClass} ${tableNumClass}`}>Total</th>
              <th className={tableHeadClass}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {[["V-20261012-0008", "Administrador", "$1,912.84", "success", "Completada"], ["V-20261012-0007", "Administrador", "$339.88", "warning", "Devolución parcial"], ["V-20261012-0006", "Administrador", "$501.12", "danger", "Cancelada"]].map(([f, c, t, tone, s]) => (
              <tr className={tableRowClass} key={f}>
                <td className={tableCellClass}>{f}</td>
                <td className={tableCellClass}>{c}</td>
                <td className={`${tableCellClass} ${tableNumClass}`}>{t}</td>
                <td className={tableCellClass}><Badge tone={tone as "success"}>{s}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination onPageChange={setPage} page={page} totalPages={9} />
      </Section>

      <Section title="Avisos">
        <div className="grid gap-3">
          <Toast>Aviso neutro</Toast>
          <Toast tone="success">Venta registrada</Toast>
          <Toast tone="warning">Stock por debajo del mínimo</Toast>
          <Toast tone="danger">No se pudo guardar</Toast>
          <Toast tone="info">Sincronizando ventas…</Toast>
        </div>
      </Section>

      <Section title="Estados">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card><EmptyState icon={<Search size={32} />} message="Sin resultados para tu búsqueda." /></Card>
          <Card><ErrorState onRetry={() => undefined} /></Card>
        </div>
        <div className="grid gap-4 sm:grid-cols-3"><SkeletonKPI /><SkeletonKPI /><SkeletonKPI /></div>
        <SkeletonTable cols={4} rows={3} />
        <Skeleton className="h-4 w-48" />
      </Section>

      <Section title="Navegación y diálogo">
        <Breadcrumb items={[{ href: "/", label: "Inventario" }, { href: "/productos", label: "Productos" }, { label: "Martillo uña curva" }]} />
        <div className={row}><Button onClick={() => setModal(true)} variant="secondary">Abrir diálogo</Button></div>
      </Section>

      <Modal
        footer={<><Button onClick={() => setModal(false)} variant="secondary">Cancelar</Button><Button onClick={() => setModal(false)}>Confirmar</Button></>}
        onClose={() => setModal(false)}
        open={modal}
        title="Cobrar venta"
      >
        <p className="text-ink-2">Diálogo blueprint con marcas de registro, foco atrapado y cierre con Esc.</p>
      </Modal>
    </main>
  );
}
