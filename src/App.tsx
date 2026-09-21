import { Routes, Route } from "react-router";
import { DirectionProvider } from "@radix-ui/react-direction";
import { Toaster } from "@/components/ui/sonner";
import { useI18n } from "@/i18n";
import Home from "./pages/Home";
import Login from "./pages/Login";
import ExamEntry from "./pages/ExamEntry";
import ExamPrep from "./pages/ExamPrep";
import ExamRunner from "./pages/ExamRunner";
import ExamDone from "./pages/ExamDone";
import ExamResult from "./pages/ExamResult";
import ExamGuide from "./pages/ExamGuide";
import DashboardLayout from "./pages/dashboard/Layout";
import Overview from "./pages/dashboard/Overview";
import Exams from "./pages/dashboard/Exams";
import ExamDetail from "./pages/dashboard/ExamDetail";
import QuestionBank from "./pages/dashboard/QuestionBank";
import AiStudio from "./pages/dashboard/AiStudio";
import Monitoring from "./pages/dashboard/Monitoring";
import Grading from "./pages/dashboard/Grading";
import GradingSession from "./pages/dashboard/GradingSession";
import Results from "./pages/dashboard/Results";
import Users from "./pages/dashboard/Users";
import Candidates from "./pages/dashboard/Candidates";
import Fellowships from "./pages/dashboard/Fellowships";
import Audit from "./pages/dashboard/Audit";
import { RequirePermission, Forbidden } from "@/lib/permissions";

export default function App() {
  const { dir } = useI18n();
  return (
    <DirectionProvider dir={dir}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/exam" element={<ExamEntry />} />
        <Route path="/exam/prep" element={<ExamPrep />} />
        <Route path="/exam/run" element={<ExamRunner />} />
        <Route path="/exam/done" element={<ExamDone />} />
        <Route path="/exam/result" element={<ExamResult />} />
        <Route path="/exam/guide" element={<ExamGuide />} />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<Overview />} />
          <Route path="exams" element={<Exams />} />
          <Route path="exams/:id" element={<ExamDetail />} />
          <Route path="bank" element={<QuestionBank />} />
          <Route path="ai" element={<AiStudio />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="grading" element={<Grading />} />
          <Route path="grading/:sessionId" element={<GradingSession />} />
          <Route path="results" element={<Results />} />
          <Route path="candidates" element={<RequirePermission permission="candidates.view"><Candidates /></RequirePermission>} />
          <Route path="fellowships" element={<RequirePermission permission="fellowships.view"><Fellowships /></RequirePermission>} />
          <Route path="users" element={<RequirePermission permission="users.manage"><Users /></RequirePermission>} />
          <Route path="audit" element={<RequirePermission permission="audit.view"><Audit /></RequirePermission>} />
          <Route path="403" element={<Forbidden />} />
        </Route>
        <Route path="*" element={<Home />} />
      </Routes>
      <Toaster richColors position={dir === "rtl" ? "top-left" : "top-right"} />
    </DirectionProvider>
  );
}
