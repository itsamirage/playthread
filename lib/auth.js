import { createContext, useContext, useEffect, useState } from "react";

import { getEmailRedirectUrl } from "./authRedirect";
import { supabase } from "./supabase";

const AuthContext = createContext({
  session: null,
  isLoading: true,
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z0-9_]{3,20}$/;

export function getPasswordChecks(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

export function isValidEmail(email) {
  return emailPattern.test(email.trim().toLowerCase());
}

export function isValidUsername(username) {
  return usernamePattern.test(username.trim().toLowerCase());
}

export function isValidPassword(password) {
  return Object.values(getPasswordChecks(password)).every(Boolean);
}

export async function loginUser({ email, password }) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function isUsernameAvailable(username) {
  const cleanUsername = username.trim().toLowerCase();

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", cleanUsername)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return !data;
}

export async function signupUser({ email, username, password }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();
  const usernameAvailable = await isUsernameAvailable(cleanUsername);

  if (!usernameAvailable) {
    return {
      error: {
        message: "That username is already taken.",
      },
      profileReason: "username-taken",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        username: cleanUsername,
      },
      emailRedirectTo: getEmailRedirectUrl(),
    },
  });

  if (error) {
    return { error };
  }

  const userId = data.user?.id;

  if (!userId) {
    return { data, profileUpdated: false, profileReason: "missing-user-id" };
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      username: cleanUsername,
      display_name: cleanUsername,
    })
    .eq("id", userId);

  if (profileError) {
    if (String(profileError.message ?? "").toLowerCase().includes("duplicate")) {
      return { data, profileUpdated: false, profileReason: "username-taken" };
    }

    return { data, profileUpdated: false, profileReason: "profile-update-failed" };
  }

  return { data, profileUpdated: true, profileReason: null };
}

export async function logoutUser() {
  return supabase.auth.signOut();
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (isMounted) {
        setSession(currentSession ?? null);
        setIsLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
