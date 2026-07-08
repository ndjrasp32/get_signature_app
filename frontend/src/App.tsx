import { useEffect, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { SignPage } from "./pages/SignPage";

function parseHashRoute() {
  const hash = window.location.hash || "#/sign";
  const withoutHash = hash.replace(/^#/, "");
  const [pathPart, queryPart = ""] = withoutHash.split("?");

  return {
    path: pathPart || "/sign",
    params: new URLSearchParams(queryPart)
  };
}

export function App() {
  const [route, setRoute] = useState(parseHashRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseHashRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  if (route.path.startsWith("/admin")) {
    return <AdminPage />;
  }

  return <SignPage publicToken={route.params.get("doc") || ""} />;
}
