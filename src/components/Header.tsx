import { useState, useRef, useEffect } from "react";
import { GoogleLogin } from "@react-oauth/google";
import {
  SunIcon,
  MoonIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import ConfirmationModal from "./ConfirmationModal";

type Theme = "light" | "dark";

interface HeaderProps {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  handleLogoutClick: () => void;
  handleLoginSuccess: (credentialResponse: any) => void;
  handleLoginError: () => void;
  user: any;
  currentTheme: Theme;
  onThemeToggle: () => void;
}

const Header = ({
  isAuthLoading,
  isAuthenticated,
  handleLogoutClick,
  handleLoginSuccess,
  handleLoginError,
  user,
  currentTheme,
  onThemeToggle,
}: HeaderProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null); // Ref for the menu container

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- Logout Confirmation Handlers ---
  const openLogoutModal = () => {
    setIsMenuOpen(false); // Close the dropdown first
    setIsLogoutModalOpen(true);
  };

  const closeLogoutModal = () => {
    setIsLogoutModalOpen(false);
  };

  const confirmLogout = () => {
    handleLogoutClick(); // Call the original logout handler passed via props
    closeLogoutModal();
  };
  // --- End Logout Confirmation Handlers ---

  return (
    <>
      <header className="flex flex-row justify-between items-center w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-4 md:px-8 py-2 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div
          className="py-2 cursor-pointer"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          <h1 className="text-2xl font-bold cormorant-upright-semibold">
            EverTale
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {isAuthLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading user...</p>
          ) : isAuthenticated && user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-900"
              >
                <span className="text-gray-700 dark:text-gray-300">
                  {user.name}
                </span>
                <ChevronDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
              </button>

              {/* Dropdown Menu */}
              {isMenuOpen && (
                <div className="absolute right-0 mt-2 p-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10">
                  <button
                    onClick={() => {
                      onThemeToggle();
                      setIsMenuOpen(false); // Close menu after action
                    }}
                    className="w-full flex items-center rounded-md gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label={
                      currentTheme === "light"
                        ? "Switch to dark mode"
                        : "Switch to light mode"
                    }
                  >
                    {currentTheme === "light" ? (
                      <MoonIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <SunIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {currentTheme === "light" ? "Dark Mode" : "Light Mode"}
                    </span>
                  </button>
                  <div className="border-t border-gray-200 dark:border-gray-700 mx-3 my-1"></div>
                  <button
                    onClick={openLogoutModal}
                    className="w-full text-left px-4 py-2 text-sm rounded-md text-gray-700 dark:text-gray-300 font-semibold hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/[0.3]"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col justify-end gap-2">
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={handleLoginError}
                theme="outline"
                size="medium"
                shape="rectangular"
              />
            </div>
          )}
        </div>
      </header>

      {/* --- Logout Confirmation Modal --- */}
      <ConfirmationModal
        isOpen={isLogoutModalOpen}
        onClose={closeLogoutModal}
        onConfirm={confirmLogout}
        title="Confirm Logout"
        message="Are you sure you want to log out?"
        confirmText="Log Out"
        cancelText="Cancel"
      />
    </>
  );
};

export default Header;
