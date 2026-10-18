# Notas QA-UI (navegador, esquema shots)

## Hallazgos
- QA-UI-01 (Alto) No existe forma de dar de alta una segunda caja registradora: no hay POST en backend/app/api/cash_register.py (solo PATCH /registers/<id> y agent-key) ni pantalla; solo seed.py:196 crea "Caja 1". README/DEPLOYMENT hablan de varias cajas en la LAN. Con una sola caja, si el admin deja su turno abierto el cajero no puede vender ("Esta caja ya tiene una sesión abierta"). Corrección: POST /cash-register/registers (admin) + botón "Nueva caja" en Configuración → Cajas.

## Matriz
- 1 Login: error de contraseña ✅; login ✅; cambio obligatorio: no se puede saltar (ruta y API 403) ✅, validación 8 caracteres ✅, no coinciden ✅, al guardar entra al POS ✅
- 2 Abrir caja: cajero no ve sesión ajena ✅; conflicto de caja ocupada se avisa ✅
