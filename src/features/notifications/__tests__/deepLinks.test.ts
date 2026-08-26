/**
 * BUILD-SPEC section 18: "Deep links: waitlist → session detail; announcement
 * → announcement detail."
 *
 * The payload arrives from outside the app through two push services, so the
 * cases that matter are the malformed ones as much as the good ones.
 */
import { notificationTarget } from '../deepLinks';

describe('notificationTarget', () => {
  it('sends a waitlist push to the session detail screen', () => {
    expect(notificationTarget({ type: 'waitlist_spot', sessionId: 's1' }, 'player')).toEqual({
      tree: 'player',
      tab: 'ScheduleTab',
      screen: 'SessionDetail',
      params: { sessionId: 's1' },
    });
  });

  it('sends an announcement push to the announcement detail screen', () => {
    expect(notificationTarget({ type: 'announcement', announcementId: 'a1' }, 'player')).toEqual({
      tree: 'player',
      tab: 'Announcements',
      screen: 'AnnouncementDetail',
      params: { announcementId: 'a1' },
    });
  });

  it('sends a staff announcement push into the More stack', () => {
    // 15.11 keeps the staff list under More; 14.11's tab does not exist on
    // that side of the app.
    expect(notificationTarget({ type: 'announcement', announcementId: 'a1' }, 'admin')).toEqual({
      tree: 'admin',
      tab: 'More',
      screen: 'AnnouncementDetail',
      params: { announcementId: 'a1' },
    });
  });

  it('opens nothing for a waitlist push on the staff side', () => {
    // 14.7's session detail is a player screen. Sending a coach to the roster
    // instead would be sending him somewhere the notification is not about.
    expect(notificationTarget({ type: 'waitlist_spot', sessionId: 's1' }, 'admin')).toBeNull();
  });

  it('ignores a payload with no id', () => {
    expect(notificationTarget({ type: 'waitlist_spot' }, 'player')).toBeNull();
    expect(notificationTarget({ type: 'announcement', announcementId: '  ' }, 'player')).toBeNull();
  });

  it('ignores an id that is not a string', () => {
    expect(notificationTarget({ type: 'announcement', announcementId: 42 }, 'player')).toBeNull();
  });

  it('ignores a type it does not know', () => {
    // D70 allows exactly two triggers. A third would have had to come from
    // somewhere other than this app's server.
    expect(notificationTarget({ type: 'booking_confirmed', bookingId: 'b1' }, 'player')).toBeNull();
  });

  it('ignores a payload that is not an object', () => {
    expect(notificationTarget(null, 'player')).toBeNull();
    expect(notificationTarget('waitlist_spot', 'player')).toBeNull();
    expect(notificationTarget(undefined, 'player')).toBeNull();
  });
});
