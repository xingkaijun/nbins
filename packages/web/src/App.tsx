import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, ProtectedRoute, useAuth } from "./auth-context";
import { Layout } from "./components/Layout";
import { ProjectProvider } from "./project-context";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { Reports } from "./pages/Reports";
import { Import } from "./pages/Import";
import { SqlConsole } from './pages/SqlConsole';
import { Admin } from "./pages/Admin";
import { Login } from "./pages/Login";
import { Observations } from "./pages/Observations";
import { Ncrs } from "./pages/Ncrs";
import { Fats } from "./pages/Fats";
import { InspectionDetailPage } from "./pages/InspectionDetailPage";
import { INSPECTION_DETAIL_ROUTE } from "./inspection-sync";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";

const routerBasename = import.meta.env.BASE_URL === "/" ? undefined : import.meta.env.BASE_URL.replace(/\/$/, "");

function AdminGuard() {
  const { session } = useAuth();
  if (session?.user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return <Admin />;
}

export function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      <ToastProvider>
      <AuthProvider>
        <ProjectProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                {/*
                  Standalone inspection page: a sibling of the "/" layout route so
                  the new browser tab gets a lightweight shell (own header, no
                  TopBar / global nav / project picker) instead of the full app.
                  It is NOT under Layout but stays under ProtectedRoute, so the
                  auth guard, ErrorBoundary, ToastProvider and basename are the
                  same as for every other page.
                */}
                <Route path={INSPECTION_DETAIL_ROUTE} element={<InspectionDetailPage />} />
                <Route path="/" element={<Layout />}>
                  <Route index element={<Projects />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="import" element={<Import />} />
                  <Route path="observations" element={<Observations />} />
                  <Route path="ncrs" element={<Ncrs />} />
                  <Route path="fats" element={<Fats />} />

                  <Route path="admin" element={<AdminGuard />} />
                  <Route path="admin/sql" element={<SqlConsole />} />
                </Route>
              </Route>
            </Routes>
          </ErrorBoundary>
        </ProjectProvider>
      </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
