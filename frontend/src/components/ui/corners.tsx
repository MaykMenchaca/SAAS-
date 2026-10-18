/**
 * Marcas de registro "+" en las 4 esquinas de un objeto "blueprint" (sistema Industry).
 * El contenedor debe llevar la clase `blueprint` (position: relative + borde fino):
 *
 *   <section className="blueprint"><Corners />…</section>
 *
 * Las marcas son decorativas y no reciben eventos.
 */
export function Corners() {
  return (
    <>
      <i aria-hidden="true" className="corner tl" />
      <i aria-hidden="true" className="corner tr" />
      <i aria-hidden="true" className="corner bl" />
      <i aria-hidden="true" className="corner br" />
    </>
  );
}
