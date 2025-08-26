import { useEffect, useState } from "react";

export function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });

  useEffect(() => {
    // Apply theme class on mount and when theme changes
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}
