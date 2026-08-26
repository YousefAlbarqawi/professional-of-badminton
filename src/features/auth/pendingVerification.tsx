/**
 * The credentials the verify screen polls with.
 *
 * 14.3 says the verify screen "polls the session every 5 seconds and advances
 * automatically on confirmation". There is no session to poll — GoTrue
 * withholds one until the link is followed — so the poll is a sign-in attempt,
 * which needs the password the player has just typed.
 *
 * It is held here, in memory, for the life of the auth flow, rather than in a
 * route param. Route params are part of a serialisable navigation state; a
 * password does not belong in one.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { SignUpInput } from './types';

export interface PendingVerification {
  /** What the poll signs in with. */
  email: string;
  password: string;
  /**
   * The whole sign-up, present only when the player arrived from the sign-up
   * form. Changing the address means registering again, and registering again
   * needs the name and phone the first attempt carried.
   *
   * Null when he arrived from sign in, where there is nothing to change: the
   * account already exists at that address and only needs confirming.
   */
  signUpInput: SignUpInput | null;
}

interface PendingVerificationValue {
  pending: PendingVerification | null;
  setPending: (value: PendingVerification) => void;
  clearPending: () => void;
}

const PendingVerificationContext = createContext<PendingVerificationValue | null>(null);

export const PendingVerificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [pending, setPendingState] = useState<PendingVerification | null>(null);

  const setPending = useCallback((value: PendingVerification): void => {
    setPendingState(value);
  }, []);

  const clearPending = useCallback((): void => setPendingState(null), []);

  const value = useMemo<PendingVerificationValue>(
    () => ({ pending, setPending, clearPending }),
    [clearPending, pending, setPending],
  );

  return (
    <PendingVerificationContext.Provider value={value}>
      {children}
    </PendingVerificationContext.Provider>
  );
};

export function usePendingVerification(): PendingVerificationValue {
  const value = useContext(PendingVerificationContext);
  if (value === null) {
    throw new Error('usePendingVerification() must be called inside a PendingVerificationProvider');
  }
  return value;
}
