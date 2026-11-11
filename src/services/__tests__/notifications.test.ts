/** Toucher une notification : l'app ouvre l'écran de son `data.url`. */
import { __resetNotificationsForTests, notificationUrl, subscribeNotificationOpens } from '../notifications';

const DEFAULT = 'expo.modules.notifications.actions.DEFAULT';

jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('../supabase', () => ({ getSupabase: () => null }));

type Listener = (r: unknown) => void;
const N = jest.requireMock('expo-notifications') as {
  getLastNotificationResponse: jest.Mock;
  clearLastNotificationResponse: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
};

function response(data: unknown, actionIdentifier = DEFAULT) {
  return { actionIdentifier, notification: { request: { content: { data } } } };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetNotificationsForTests();
});

describe('notificationUrl', () => {
  it('ne suit que les routes internes', () => {
    expect(notificationUrl({ url: '/panier' })).toBe('/panier');
    expect(notificationUrl({ url: '/recette/abc', kind: 'cooking-timer' })).toBe('/recette/abc');
    expect(notificationUrl({ url: 'https://exemple.fr' })).toBeNull();
    expect(notificationUrl({ url: '//exemple.fr' })).toBeNull();
    expect(notificationUrl({ url: 42 })).toBeNull();
    expect(notificationUrl(null)).toBeNull();
    expect(notificationUrl('panier')).toBeNull();
  });
});

describe('subscribeNotificationOpens', () => {
  it('démarrage à froid : la notification qui a lancé l’app est suivie une fois, puis oubliée', () => {
    N.getLastNotificationResponse.mockReturnValueOnce(response({ url: '/panier' }));
    const open = jest.fn();
    const unsubscribe = subscribeNotificationOpens(open);
    expect(open).toHaveBeenCalledWith('/panier');
    expect(N.clearLastNotificationResponse).toHaveBeenCalled();
    unsubscribe();
  });

  it('app ouverte ou en arrière-plan : chaque toucher ouvre l’écran ; désabonnement propre', () => {
    const remove = jest.fn();
    let listener: Listener = () => undefined;
    N.addNotificationResponseReceivedListener.mockImplementationOnce((l: Listener) => {
      listener = l;
      return { remove };
    });
    const open = jest.fn();
    const unsubscribe = subscribeNotificationOpens(open);
    expect(open).not.toHaveBeenCalled();

    listener(response({ url: '/panier' }));
    listener(response({ url: '/' }));
    // Bouton d'action personnalisé, ou URL externe : ignorés.
    listener(response({ url: '/panier' }, 'snooze'));
    listener(response({ url: 'https://exemple.fr' }));
    expect(open.mock.calls).toEqual([['/panier'], ['/']]);

    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});
