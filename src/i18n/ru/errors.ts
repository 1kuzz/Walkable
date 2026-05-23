import type { Messages } from '../types';

export const ruErrorMessages = {
  'error.generic': 'Что-то пошло не так. Попробуйте снова.',
  'error.network': 'Сетевая ошибка. Проверьте подключение.',
  'error.authFailed': 'Ошибка аутентификации. Попробуйте снова.',
  'error.accessDenied': 'Доступ запрещен.',
  'error.requestTimeout': 'Превышено время ожидания запроса. Попробуйте снова.',
  'error.betaAccessRequired': 'Требуется доступ к бета-версии.',
  'error.accountLocked':
    'Учетная запись временно заблокирована из-за большого числа неудачных попыток. Повторите через {{minutes}} мин.',
} satisfies Messages;
