/**
 * A handle on the navigation tree for things that happen outside it.
 *
 * There is exactly one of those: a player tapping a notification while the app
 * is closed or in the background (BUILD-SPEC section 18, "Deep links: waitlist
 * → session detail; announcement → announcement detail"). That tap is answered
 * by an `expo-notifications` listener, which is not a component and has no
 * `useNavigation` to reach for.
 *
 * The ref is typed against both tab param lists at once. 14.0 gives a signed-in
 * account one tree or the other and never both, and the two key sets are
 * disjoint, so the intersection is simply "every tab that could be mounted".
 * Which one actually is mounted is a runtime question, and
 * `features/notifications/deepLinks.ts` answers it from the profile's role
 * rather than guessing.
 */
import { createNavigationContainerRef } from '@react-navigation/native';

import type { AdminTabParamList, PlayerTabParamList } from './types';

export type AnyTabParamList = PlayerTabParamList & AdminTabParamList;

export const navigationRef = createNavigationContainerRef<AnyTabParamList>();
