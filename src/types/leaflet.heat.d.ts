/**
 * leaflet.heat no publica tipos. Solo se declara el módulo para poder
 * importarlo por su efecto secundario: el plugin engancha `heatLayer` al objeto
 * L global, y la firma real se describe en el componente que lo usa
 * (LeafletConHeat en mapa-estadistico-page).
 */
declare module 'leaflet.heat';
