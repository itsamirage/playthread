import { createContext, useContext, useEffect, useState } from "react";
import * as Linking from "expo-linking";

import { parseSupabaseAuthCallback } from "./authCallback";
import { getEmailRedirectUrl, getPasswordResetRedirectUrl } from "./authRedirect";
import { supabase } from "./supabase";
export { isValidUsername } from "./usernameValidation";

const AuthContext = createContext({
  session: null,
  isLoading: true,
  isPasswordRecovery: false,
  recoveryError: "",
  clearRecoveryState: () => {},
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function isValidPassword(password) {
  return Object.values(getPasswordChecks(password)).every(Boolean);
}

export async function loginUser({ email, password }) {
  return supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
}

export async function requestPasswordReset(email) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: getPasswordResetRedirectUrl(),
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
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const handleRecoveryUrl = async (url) => {
      const callback = parseSupabaseAuthCallback(url);

      if (!callback) {
        return;
      }

      if (callback.errorDescription) {
        if (isMounted) {
          setRecoveryError(callback.errorDescription);
          setIsPasswordRecovery(true);
        }
        return;
      }

      if (callback.accessToken && callback.refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });

        if (isMounted) {
          if (error) {
            setRecoveryError(error.message);
          } else {
            setSession(data.session ?? null);
            setRecoveryError("");
          }

          setIsPasswordRecovery(callback.type === "recovery");
        }
      } else if (callback.type === "recovery" && isMounted) {
        setIsPasswordRecovery(true);
      }
    };

    const loadSession = async () => {
      const initialUrl = await Linking.getInitialURL();

      if (initialUrl) {
        await handleRecoveryUrl(initialUrl);
      }

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
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        setSession(nextSession ?? null);
        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
          setRecoveryError("");
        } else if (event === "SIGNED_OUT") {
          setIsPasswordRecovery(false);
        }
        setIsLoading(false);
      }
    });

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleRecoveryUrl(url);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      linkingSubscription.remove();
    };
  }, []);

  const clearRecoveryState = () => {
    setIsPasswordRecovery(false);
    setRecoveryError("");
  };

  return (
    <AuthContext.Provider
      value={{ session, isLoading, isPasswordRecovery, recoveryError, clearRecoveryState }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export async function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}

export async function updateEmail(email) {
  return supabase.auth.updateUser({ email: email.trim().toLowerCase() });
}

export function useAuth() {
  return useContext(AuthContext);
}
