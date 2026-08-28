# ⚠️ Estos SQL están desactualizados y mal numerados

Los 5 archivos de esta carpeta son una copia antigua y **su numeración no
coincide** con la cadena real de migraciones:

| Aquí | En la cadena real |
|------|-------------------|
| `V16__agencias_externas.sql`   | `V25__agencias_externas.sql`   |
| `V17__multicanal_adjuntos.sql` | `V24__multicanal_adjuntos.sql` |

Aplicarlos creyendo que están al día deja el esquema incompleto y con los
números corridos, y a partir de ahí ninguna migración posterior encaja.

## La cadena buena está en `docs/sql/master/`

Son 55 archivos, de `V1` a `V55`, y es la que consume este frontend. Se aplican
en orden con el script, que ya distingue qué va a la base maestra y qué a cada
tenant:

```bash
./scripts/apply_schema.sh master secad-postgres        secad_app        Secad
./scripts/apply_schema.sh tenant secad-postgres-cali   secad_cali_app   Secad_Cali
./scripts/apply_schema.sh tenant secad-postgres-bogota secad_bogota_app Secad_Bogota
```

Las tablas que necesita la operación portada —`cad_video_sesiones`,
`cad_video_chat_mensajes`, `cad_adjuntos`, `cad_pedidos`, `cad_eventos`— viven
de `V24` en adelante, así que sin esa cadena completa las pantallas de operación
no tienen contra qué consultar.

Estos 5 archivos se dejan por si sirven de referencia histórica. No los apliques.
