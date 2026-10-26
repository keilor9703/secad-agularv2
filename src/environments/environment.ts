export const environment = {
  production: false,
  apiBaseUrl: '/api',
  bannerApiUrl: '/api/Banner',
  mediaBaseUrl: 'http://srvdockergusof.policia.gov.co:8088',
  sliderApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/Slider',
  sliderMediaBaseUrl: 'http://srvdockergusof.policia.gov.co:8088',
  noticiaApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/Noticia',
  radioApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/Radio',
  modalApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/Modal',
  eventoApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/Evento',
  eventoMediaBaseUrl: 'http://srvdockergusof.policia.gov.co:8088',
  videoInstitucionalApiUrl: 'http://srvdockergusof.policia.gov.co:8088/api/VideoInstitucional',

  // TURN (retransmisión de la videollamada en redes móviles): YA NO se configura
  // aquí. Antes este archivo llevaba la dirección del servidor y una credencial
  // permanente, y como todo lo que hay en `environment` viaja en el JavaScript
  // público, cualquiera podía usar nuestro coturn como retransmisor propio.
  // Ahora el backend entrega credenciales efímeras firmadas (GET
  // /api/VideoLlamada/ice y la respuesta de /VideoLlamada/publico/{token}).
  // Se configuran en el servidor con Turn__Urls y Turn__Secret: docs/turn-coturn.md.
};

