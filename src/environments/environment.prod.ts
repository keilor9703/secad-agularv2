export const environment = {
  production: true,
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

  // Servidor TURN propio (coturn) desplegado en el mismo servidor OCI, para
  // que la videollamada con el ciudadano atraviese el NAT simétrico de los
  // operadores celulares — ver video-llamada.service.ts. Sin esto solo queda
  // STUN y la llamada se queda en negro en buena parte de las redes móviles.
  //
  // Los valores vienen del despliegue que ya está en producción
  // (secad_angular/frontend/src/environments/environment.prod.ts): esta
  // compilación lo reemplaza, así que tiene que apuntar al mismo coturn.
  //
  // La credencial de larga duración queda visible en el bundle público — es
  // inevitable, el navegador la necesita para autenticar el ALLOCATE — y es un
  // riesgo ya asumido en el despliegue anterior. Para endurecerlo: coturn con
  // `use-auth-secret` y un endpoint del backend que emita credenciales
  // efímeras HMAC.
  turnUrls: ['turn:129.80.243.118:3478?transport=udp', 'turn:129.80.243.118:3478?transport=tcp'],
  turnUsername: 'secad',
  turnCredential: '6KpIEJuDnU/gzWJiDztD0UFiaUUYAn98',
};
