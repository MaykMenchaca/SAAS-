import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { updateConfig } from "../../api/config";
import { qk } from "../../api/query-keys";
import { cn } from "../../lib/cn";
import { Button, Input, Modal } from "../ui";
import { BrandMark, LOGO_COLORS, LOGO_ICONS, isCustomColor } from "./brand-mark";
import { useBrand } from "./use-brand";

/** Diálogo para que el administrador personalice nombre, lema, icono y color de la marca del local. */
export function BrandCustomizer({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const brand = useBrand();
  const [name, setName] = useState(brand.name);
  const [subtitle, setSubtitle] = useState(brand.subtitle);
  const [iconKey, setIconKey] = useState(brand.iconKey);
  const [colorKey, setColorKey] = useState(brand.colorKey);

  const mutation = useMutation({
    mutationFn: (updates: Record<string, string>) => updateConfig(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.branding() });
      queryClient.invalidateQueries({ queryKey: qk.systemConfig() });
      toast.success("Diseño de marca actualizado.");
      onClose();
    },
    onError: () => toast.error("No se pudo actualizar el diseño de marca."),
  });

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("El nombre del local no puede estar vacío.");
      return;
    }
    mutation.mutate({
      company_name: trimmed,
      company_subtitle: subtitle.trim(),
      company_logo_icon: iconKey,
      company_logo_color: colorKey,
    });
  }

  return (
    <Modal
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button disabled={mutation.isPending} onClick={save}>
            {mutation.isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
        </>
      }
      onClose={onClose}
      open
      title="Personalizar el diseño del local"
    >
      <div className="grid gap-5">
        {/* Vista previa tal como se verá en el menú lateral */}
        <div className="border border-divider p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-2">Vista previa en la barra lateral</div>
          <div className="flex items-center gap-3">
            <BrandMark colorKey={colorKey} iconKey={iconKey} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-heading text-lg font-semibold leading-tight">{name || "Ferretería"}</div>
              <div className="truncate text-xs uppercase tracking-[0.1em] text-ink-2">{subtitle || "VRNTAS POS"}</div>
            </div>
          </div>
        </div>

        <Input label="Nombre del local" maxLength={40} name="brand-name" onChange={(e) => setName(e.target.value)} placeholder="Ej. Ferretería El Clavo" value={name} />
        <Input label="Subtítulo / lema" maxLength={30} name="brand-subtitle" onChange={(e) => setSubtitle(e.target.value)} placeholder="Ej. Sucursal Centro" value={subtitle} />

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-ink-2">Icono de la marca</legend>
          <div className="grid grid-cols-6 gap-2">
            {Object.entries(LOGO_ICONS).map(([key, Icon]) => (
              <button
                aria-label={key}
                aria-pressed={iconKey === key}
                className={cn(
                  "flex h-11 w-11 items-center justify-center border transition-colors duration-150 hover:bg-line-soft",
                  iconKey === key ? "border-accent bg-acc-tint text-acc-text" : "border-divider",
                )}
                key={key}
                onClick={() => setIconKey(key)}
                type="button"
              >
                <Icon aria-hidden="true" size={18} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium text-ink-2">Color del icono</legend>
          <div className="flex flex-wrap gap-3">
            {LOGO_COLORS.map((color) => (
              <button
                aria-label={color.label}
                aria-pressed={colorKey === color.id}
                className={cn(
                  "relative flex h-8 w-8 items-center justify-center border border-divider before:absolute before:inset-[-6px] before:content-['']",
                  color.bg,
                  colorKey === color.id && "outline outline-2 outline-offset-2 outline-accent",
                )}
                key={color.id}
                onClick={() => setColorKey(color.id)}
                title={color.label}
                type="button"
              >
                {colorKey === color.id ? <Check aria-hidden="true" className={color.text} size={14} /> : null}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink-2" htmlFor="brand-hue">Color personalizado (matiz)</label>
            <span className="text-xs tabular-nums text-ink-2">{isCustomColor(colorKey) ? `${colorKey}°` : "Por defecto"}</span>
          </div>
          <input
            className="h-1.5 w-full cursor-pointer appearance-none"
            id="brand-hue"
            max="360"
            min="0"
            onChange={(e) => setColorKey(e.target.value)}
            style={{ background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
            type="range"
            value={isCustomColor(colorKey) ? colorKey : "235"}
          />
        </div>
      </div>
    </Modal>
  );
}
