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

  // Servidor TURN propio para la videollamada WebRTC (coturn). Vacío por
  // defecto: sin TURN solo queda STUN, que falla en muchas redes celulares con
  // NAT simétrico de operador — ver video-llamada.service.ts.
  turnUrls: [] as string[],
  turnUsername: '',
  turnCredential: '',
};

