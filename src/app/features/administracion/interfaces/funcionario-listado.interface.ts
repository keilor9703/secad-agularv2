export type FuncionarioEstado = 'Success' | 'Pending' | 'Inactive';

export interface FuncionarioListado {
  id: number;
  especialidad: string;
  identificacion: string;
  name: string;
  email: string;
  position: string;
  company: string;
  country: string;
  correo: string;
  estado: FuncionarioEstado;
}
