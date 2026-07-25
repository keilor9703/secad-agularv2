/**
 * Puente temporal para imports existentes.
 *
 * @deprecated Importar AlertService desde shared/services/alert.service.
 */
export type {
  AlertIntent,
  AlertOptions,
  ConfirmAlertOptions,
} from '../../shared/models/alert-options.model';
export { AlertService } from '../../shared/services/alert.service';
