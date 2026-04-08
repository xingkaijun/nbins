import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, ProtectedRoute } from "./auth-context";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Projects } from "./pages/Projects";
import { Reports } from "./pages/Reports";
import { Import } from "./pages/Import";
import { Admin } from "./pages/Admin";
import { Login } from "./pages/Login";
import { Observations } from "./pages/Observations";
import { Ncrs } from "./pages/Ncrs";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Projects />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="reports" element={<Reports />} />
              <Route path="import" element={<Import />} />
              <Route path="observations" element={<Observations />} />
              <Route path="ncrs" element={<Ncrs />} />
              <Route path="admin" element={<Admin />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
