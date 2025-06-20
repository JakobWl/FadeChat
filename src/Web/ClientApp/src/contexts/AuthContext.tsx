import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import authStorage from "../utils/authStorage";
import { CurrentUserDto, LoginRequest } from "../api/client";
import { usersClient } from "../api";
import config from "../config";
import { useNavigation, NavigationProp } from "@react-navigation/native";
import { MainTabParamList, navigate } from "../navigation/AppNavigator";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri, useAuthRequest } from "expo-auth-session";
import { Platform } from "react-native";

WebBrowser.maybeCompleteAuthSession();

interface LoginCredentials {
	email: string;
	password: string;
}

interface AuthContextType {
	user: CurrentUserDto | null;
	isAuthenticated: boolean;
	isLoading: boolean;
	loginWithEmail: (credentials: LoginCredentials) => Promise<boolean>;
	loginWithGoogle: () => Promise<boolean>;
	loginWithFacebook: () => Promise<boolean>;
	logout: () => Promise<void>;
	fetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
	user: null,
	isAuthenticated: false,
	isLoading: true,
	loginWithEmail: async () => false,
	loginWithGoogle: async () => false,
	loginWithFacebook: async () => false,
	logout: async () => {},
	fetchUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
	children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
	const [user, setUser] = useState<CurrentUserDto | null>(null);
	const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	const redirectUri = makeRedirectUri();
	console.log("Redirect URI:", redirectUri);

	const fetchUser = useCallback(async () => {
		console.log("Attempting to fetch current user...");
		console.log("API URL being used:", config.apiUrl);

		// Test basic connectivity first
		try {
			console.log(
				"Testing basic connectivity to:",
				`${config.apiUrl}/api/Users/me`,
			);
			const response = await fetch(`${config.apiUrl}/api/Users/me`, {
				method: "GET",
				credentials: "include",
			});
			console.log("Basic fetch response status:", response.status);
		} catch (fetchError) {
			console.log("Basic fetch failed:", fetchError);
		}

		try {
			const currentUser = await usersClient.getCurrentUser();
			console.log("User fetched successfully:", currentUser);
			setUser(currentUser);
			setIsAuthenticated(true);
			await authStorage.setUser(currentUser);
			console.log("Authentication state set to true");
		} catch (error) {
			console.log("Failed to fetch user - full error:", error);
			console.log("Error status:", (error as any)?.status);
			console.log("Error message:", (error as any)?.message);
			setUser(null);
			setIsAuthenticated(false);
			await authStorage.clearUser();
			console.log("Authentication state set to false");
		}
	}, []);

	// Handle OAuth callback via deep linking
	useEffect(() => {
		const handleDeepLink = async () => {
			// Check if user is authenticated after potential OAuth redirect
			await fetchUser();
		};

		handleDeepLink();
	}, [fetchUser]);

	useEffect(() => {
		const checkAuthState = async () => {
			setIsLoading(true);
			await fetchUser();
			setIsLoading(false);
		};

		checkAuthState();
	}, [fetchUser]);

	const loginWithEmail = async (
		credentials: LoginCredentials,
	): Promise<boolean> => {
		setIsLoading(true);
		try {
			await usersClient.postApiUsersLogin({
				email: credentials.email,
				password: credentials.password,
			} as LoginRequest);

			await fetchUser();
			console.log("Login successful, user fetched.");
			return true;
		} catch (error) {
			console.error("Login error:", error);
			setUser(null);
			setIsAuthenticated(false);
			await authStorage.clearUser();
			return false;
		} finally {
			setIsLoading(false);
		}
	};

	const loginWithGoogle = async () => {
		if (Platform.OS !== "web") {
			setIsLoading(true);
			const loginUrl = `${config.apiUrl}/api/Users/google/login?returnUrl=${encodeURIComponent(redirectUri)}`;
			console.log("Opening Google auth session URL:", loginUrl);

			const result = await WebBrowser.openAuthSessionAsync(
				loginUrl,
				redirectUri,
			);
			console.log("WebBrowser auth session result:", result);

			// After the auth session closes, check if user is now authenticated
			await fetchUser();
			setIsLoading(false);
			return true;
		} else {
			try {
				const returnUrl = window.location.href;
				window.location.href = `${config.apiUrl}/api/Users/google/login?returnUrl=${returnUrl}`;
				return true;
			} catch (error) {
				console.error("Google login initiation error:", error);
				return false;
			}
		}
	};

	const loginWithFacebook = async (): Promise<boolean> => {
		if (Platform.OS !== "web") {
			setIsLoading(true);
			const loginUrl = `${config.apiUrl}/api/Users/facebook/login?returnUrl=${encodeURIComponent(redirectUri)}`;
			console.log("Opening Facebook auth session URL:", loginUrl);

			const result = await WebBrowser.openAuthSessionAsync(
				loginUrl,
				redirectUri,
			);
			console.log("WebBrowser auth session result:", result);

			// After the auth session closes, check if user is now authenticated
			await fetchUser();
			setIsLoading(false);
			return true;
		} else {
			try {
				const returnUrl = window.location.href;
				window.location.href = `${config.apiUrl}/api/Users/facebook/login?returnUrl=${returnUrl}`;
				return true;
			} catch (error) {
				console.error("Facebook login initiation error:", error);
				return false;
			}
		}
	};

	const logout = async (): Promise<void> => {
		setIsLoading(true);
		try {
			await usersClient.logout();
		} catch (error) {
			console.error("Server logout error:", error);
		} finally {
			setUser(null);
			setIsAuthenticated(false);
			await authStorage.clearUser();
			setIsLoading(false);
			console.log("Client state cleared.");
		}
	};

	return (
		<AuthContext.Provider
			value={{
				user,
				isAuthenticated,
				isLoading,
				loginWithEmail,
				loginWithGoogle,
				loginWithFacebook,
				logout,
				fetchUser,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
};
