import { Routes, Route } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ExamEntry from "./pages/ExamEntry";
import ExamPrep from "./pages/ExamPrep";
import ExamRunner from "./pages/ExamRunner";
import ExamDone from "./pages/ExamDone";
import ExamResult from "./pages/ExamResult";
import DashboardLayout from "./pages/dashboard/Layout";
import Overview from "./pages/dashboard/Overview";
import Exams from "./pages/dashboard/Exams";
import ExamDetail from "./pages/dashboard/ExamDetail";
import QuestionBank from "./pages/dashboard/QuestionBank";
import AiStudio from "./pages/dashboard/AiStudio";
import Monitoring from "./pages/dashboard/Monitoring";
import Grading from "./pages/dashboard/Grading";
import Results from "./pages/dashboard/Results";
import Users from "./pages/dashboard/Users";
import Candidates from "./pages/dashboard/Candidates";
import Audit from "./pages/dashboard/Audit";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/exam" element={<ExamEntry />} />
        <Route path="/exam/prep" element={<ExamPrep />} />
        <Route path="/exam/run" element={<ExamRunner />} />
        <Route path="/exam/done" element={<ExamDone />} />
        <Route path="/exam/result" element={<ExamResult />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="exams" element={<Exams />} />
          <Route path="exams/:id" element={<ExamDetail />} />
          <Route path="bank" element={<QuestionBank />} />
          <Route path="ai" element={<AiStudio />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="grading" element={<Grading />} />
          <Route path="results" element={<Results />} />
          <Route path="users" element={<Users />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="audit" element={<Audit />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
      <Toaster richColors position="top-center" />
    </>
  );
}
