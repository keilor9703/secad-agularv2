export interface HeaderNotification {
  id: number;
  icon: string;
  color: string;
  count: number;
  tooltip: string;
}

export interface MiPerfilDto {
  identificacion?: string;
  gradAlfabetico?: string;
  GradAlfabetico?: string;
  grado?: string;
  nombreCompleto?: string;
  cargo?: string;
  situacionLaboral?: string;
  tiempoServicio?: string;
}
