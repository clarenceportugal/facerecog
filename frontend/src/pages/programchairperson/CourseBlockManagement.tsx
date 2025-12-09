import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  IconButton,
  Paper,
  Snackbar,
  Alert,
  Stack,
  AlertColor,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { 
  Add, 
  Edit, 
  Delete, 
  Layers, 
  Search, 
  School, 
  Class, 
  Book,
  Group,
  Category,
  Block as BlockIcon,
  Article
} from "@mui/icons-material";
import AdminMain from "./AdminMain";

type Section = {
  _id?: string;
  college?: string; // ObjectId string
  course?: string;
  section?: string;
  block?: string;
  createdAt?: string;
  updatedAt?: string;
};

type Subject = {
  _id?: string;
  id: number;
  code: string;
  name: string;
  courseId: number; // legacy field - no longer mapped to hardcoded courses
};

type SnackState = {
  open: boolean;
  message: string;
  severity: AlertColor;
};

const API_SUBJECTS_IT = "http://localhost:5000/api/auth/subjects-it"; // keep for POST/PUT/DELETE
const API_SUBJECTS_BY_COURSE = "http://localhost:5000/api/auth/subjects-by-course"; // new dynamic GET route
const API_ALL_SECTIONS = "http://localhost:5000/api/auth/all-sections"; // expects ?course=COURSECODE
const API_ADD_SECTION = "http://localhost:5000/api/auth/add-section";
const API_SECTION_ROOT = "http://localhost:5000/api/auth"; // PUT/DELETE at /:id

const LOCAL_KEYS = ["selectedCourse", "course", "currentCourse", "courseCode"];
const LOCAL_COLLEGE_KEYS = ["collegeId", "selectedCollegeId", "college", "selectedCollege"];

// fixed college ObjectId per user request
const FIXED_COLLEGE_ID = "67ff627e2fb6583dc49dccef";

const CourseBlockManagement: React.FC = () => {
  // Sections (left) - loaded from API using a course query on mount (if stored)
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(false);

  // stored course read from localStorage (display-only)
  const [courseStored, setCourseStored] = useState<string | null>(null);
  // stored college id read from localStorage (ObjectId string) - we'll set it to fixed id on mount
  const [, setCollegeStored] = useState<string | null>(null);

  // search input for filtering sections (one-line search bar)
  const [sectionsSearch, setSectionsSearch] = useState<string>("");

  // inputs for adding a new section/block
  const [newSection, setNewSection] = useState<string>("");
  const [newBlock, setNewBlock] = useState<string>("");

  // Subjects (right) - no hardcoded data; loaded from API
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(false);

  // Form states (for adding subjects)
  const [subjectName, setSubjectName] = useState<string>("");
  // subjectCode initial will be set from courseStored (last 2 letters uppercase + space)
  const [subjectCode, setSubjectCode] = useState<string>("");

  // Search state for subjects
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Snackbar
  const [snack, setSnack] = useState<SnackState>({
    open: false,
    message: "",
    severity: "success",
  });

  const showSnack = (message: string, severity: AlertColor = "success") => {
    setSnack({ open: true, message, severity });
  };
  const handleCloseSnack = () => setSnack((s) => ({ ...s, open: false }));

  // Edit dialog state for subjects (existing)
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editCode, setEditCode] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Edit dialog state for sections
  const [editSectionDialogOpen, setEditSectionDialogOpen] = useState<boolean>(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editSectionValue, setEditSectionValue] = useState<string>("");
  const [editBlockValue, setEditBlockValue] = useState<string>("");
  const [editSectionSaving, setEditSectionSaving] = useState<boolean>(false);

  // Deleting state per-id
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null);
  // Adding state
  const [addingSection, setAddingSection] = useState<boolean>(false);

  // Helpers for normalization (same rules as backend)
  const normalizeCode = (code: string) => String(code).trim().replace(/\s+/g, " ").toUpperCase();
  const normalizeTitle = (t: string) => String(t ?? "").trim();

  // Helper: derive a short course prefix from a subject code (used for display)
  // const getCourseNameFromCode = (code: string) => {
  //   const match = String(code).trim().toUpperCase().match(/^([A-Z]{1,4})/);
  //   return match ? match[1] : "—";
  // };

  // Try to read course from a few common localStorage keys
  const readCourseFromLocalStorage = (): string | null => {
    try {
      for (const k of LOCAL_KEYS) {
        const v = localStorage.getItem(k);
        if (v && v.trim().length > 0) return v.trim();
      }
    } catch (err) {
      console.warn("LocalStorage not available:", err);
    }
    return null;
  };

  // Try to read college id from a few common localStorage keys (kept for backward compatibility)
  const readCollegeFromLocalStorage = (): string | null => {
    try {
      for (const k of LOCAL_COLLEGE_KEYS) {
        const v = localStorage.getItem(k);
        if (v && v.trim().length > 0) return v.trim();
      }
    } catch (err) {
      console.warn("LocalStorage not available:", err);
    }
    return null;
  };

  // Fetch sections for a given course
  const fetchSections = async (course: string | null) => {
    if (!course?.trim()) {
      setSections([]);
      return;
    }

    setLoadingSections(true);
    try {
      const resp = await fetch(`${API_ALL_SECTIONS}?course=${encodeURIComponent(course.trim())}`);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = (await resp.json()) as Array<any>;
      const mapped: Section[] = data.map((s: any) => ({
        _id: s._id,
        college: s.college,
        course: s.course,
        section: s.section,
        block: s.block,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      setSections(mapped);
    } catch (err) {
      console.error("Failed to load sections:", err);
      showSnack("Failed to load sections from server", "error");
    } finally {
      setLoadingSections(false);
    }
  };

  // Fetch subjects for a given course using the new backend endpoint
  const fetchSubjectsByCourse = async (course: string | null) => {
    if (!course?.trim()) {
      setSubjects([]);
      return;
    }

    setLoadingSubjects(true);
    const controller = new AbortController();
    try {
      const resp = await fetch(
        `${API_SUBJECTS_BY_COURSE}?course=${encodeURIComponent(course.trim())}`,
        { signal: controller.signal }
      );
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = (await resp.json()) as Array<any>;

      // Map backend output to Subject[] and try to capture any server id shape
      const mapped: Subject[] = (data ?? []).map((item: any, idx: number) => {
        const normalizedCode = normalizeCode(
          item.courseCode ?? item.courseCodeNormalized ?? item.code ?? ""
        );
        const normalizedTitle = normalizeTitle(
          item.courseTitle ?? item.courseTitleNormalized ?? item.title ?? item.name ?? ""
        );
        // capture server id from common fields (_id, _idStr, id)
        const serverId = item._id ?? item._idStr ?? item.id ?? undefined;
        return {
          _id: serverId,
          // local numeric id (used for React keys if _id missing)
          id: Date.now() + idx,
          code: normalizedCode,
          name: normalizedTitle,
          courseId: 0,
        };
      });

      setSubjects(mapped);
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Failed to fetch subjects by course:", err);
        showSnack("Failed to load subjects from server", "error");
      }
    } finally {
      setLoadingSubjects(false);
    }
  };

  // On mount: read stored course and set fixed college id and fetch sections automatically
  useEffect(() => {
    const storedCourse = readCourseFromLocalStorage();
    readCollegeFromLocalStorage(); // Read but not used

    // set college to fixed id unconditionally (but keep storedCollege for compatibility)
    setCollegeStored(FIXED_COLLEGE_ID);
    setCourseStored(storedCourse ?? null);

    if (storedCourse) fetchSections(storedCourse);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When courseStored changes -> set initial subjectCode prefix and fetch subjects for that course
  useEffect(() => {
    if (!courseStored) {
      setSubjectCode("");
      setSubjects([]);
      return;
    }

    const cleaned = String(courseStored).trim();
    // last two letters (if course shorter than 2 chars, use entire string)
    const lastTwo = cleaned.length >= 2 ? cleaned.slice(-2) : cleaned;
    const prefix = lastTwo.toUpperCase();
    // set initial subject code to e.g. "IT "
    setSubjectCode(prefix ? `${prefix} ` : "");
    // fetch subjects from backend for this course
    fetchSubjectsByCourse(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseStored]);

  // Add subject -> POST /subjects-it (unchanged)
  const handleAddSubject = async (): Promise<void> => {
    if (!subjectName.trim() || !subjectCode.trim()) {
      showSnack("Please provide subject code and name.", "warning");
      return;
    }

    const normalizedCode = normalizeCode(subjectCode);
    const normalizedTitle = normalizeTitle(subjectName);

    // Optimistic UI id
    const tempId = Date.now() + Math.floor(Math.random() * 1000);
    const newSubjectLocal: Subject = {
      id: tempId,
      code: normalizedCode,
      name: normalizedTitle,
      courseId: 0,
    };

    // Optimistically add to UI
    setSubjects((s) => [newSubjectLocal, ...s]);
    setSubjectName("");
    setSubjectCode("");

    try {
      const resp = await fetch(API_SUBJECTS_IT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseCode: normalizedCode, courseTitle: normalizedTitle }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setSubjects((s) => s.filter((x) => x.id !== tempId));
        showSnack(json?.message ?? "Failed to add subject", "error");
        return;
      }

      const created = json?.data ?? json;
      const serverId = created?._id ?? created?.id ?? undefined;
      const serverCourseCode = created?.courseCode ?? created?.courseCodeNormalized ?? normalizedCode;
      const serverCourseTitle = created?.courseTitle ?? created?.courseTitleNormalized ?? normalizedTitle;

      setSubjects((s) =>
        s.map((x) =>
          x.id === tempId
            ? {
                ...x,
                _id: serverId,
                code: normalizeCode(serverCourseCode),
                name: normalizeTitle(serverCourseTitle),
              }
            : x
        )
      );

      showSnack("Subject added", "success");
    } catch (err) {
      console.error("Add subject error:", err);
      setSubjects((s) => s.filter((x) => x.id !== tempId));
      showSnack("Network error while adding subject", "error");
    }
  };

  // Delete subject -> DELETE /subjects-it/:id
  const handleDeleteSubject = async (subject: Subject): Promise<void> => {
    if (!subject._id) {
      showSnack("Cannot delete: server id missing. Try refreshing the list.", "warning");
      return;
    }

    const prev = subjects;
    setSubjects((s) => s.filter((x) => x._id !== subject._id));

    try {
      const resp = await fetch(`${API_SUBJECTS_IT}/${subject._id}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok) {
        setSubjects(prev);
        showSnack(json?.message ?? "Failed to delete subject", "error");
        return;
      }
      showSnack("Subject deleted", "info");
    } catch (err) {
      console.error("Delete subject error:", err);
      setSubjects(prev);
      showSnack("Network error while deleting subject", "error");
    }
  };

// Open edit dialog for subjects (improved: prefer current subject from state so we capture _id if available)
const openEditDialog = (subject: Subject) => {
  // Prefer the current subject from state so we have any server-provided _id
  const fromState =
    subjects.find((s) => (subject._id ? s._id === subject._id : s.id === subject.id)) ?? subject;

  console.debug("openEditDialog called:", { subject, fromState });
  setEditingSubject(fromState);
  setEditCode(fromState.code);
  setEditName(fromState.name);
  setEditDialogOpen(true);
};

const closeEditDialog = () => {
  setEditDialogOpen(false);
  setEditingSubject(null);
  setEditCode("");
  setEditName("");
  setEditSaving(false);
};

// Save edit for subjects (improved: try harder to find server id before falling back to local-only update)
const handleSaveEdit = async () => {
  if (!editingSubject) return;

  const newCode = normalizeCode(editCode);
  const newName = normalizeTitle(editName);

  console.debug("handleSaveEdit start", {
    editingSubject,
    editCode,
    editName,
    normalized: { newCode, newName },
  });

  if (!newCode || !newName) {
    showSnack("Code and name are required", "warning");
    return;
  }

  // Try to determine a server id from the editingSubject or by looking up
  // the subject in the current subjects array (handles cases where editingSubject
  // is stale or lost _id).
  let serverId: string | undefined;

  // 1) try editingSubject._id
  if (editingSubject._id) {
    serverId = editingSubject._id;
    console.debug("serverId found from editingSubject._id", serverId);
  }

  // 2) try find by numeric local id -> _id
  if (!serverId) {
    const byLocalId = subjects.find((s) => s.id === editingSubject.id)?._id;
    if (byLocalId) {
      serverId = byLocalId;
      console.debug("serverId found by matching local numeric id", serverId);
    } else {
      console.debug("no serverId found by local numeric id");
    }
  }

  // 3) try find by original code+name (exact match)
  if (!serverId) {
    const byCodeName = subjects.find((s) => s.code === editingSubject.code && s.name === editingSubject.name)?._id;
    if (byCodeName) {
      serverId = byCodeName;
      console.debug("serverId found by matching code+name", serverId);
    } else {
      console.debug("no serverId found by matching code+name");
    }
  }

  if (!serverId) {
    // No server id found — update locally but clearly warn the user
    console.warn("No serverId found for subject. Performing local-only update.", {
      editingSubject,
      newCode,
      newName,
    });

    setSubjects((s) =>
      s.map((x) => (x.id === editingSubject.id ? { ...x, code: newCode, name: newName } : x))
    );
    showSnack("Updated locally (server id missing). Refresh or re-fetch to persist.", "warning");
    closeEditDialog();
    return;
  }

  setEditSaving(true);
  const prev = subjects;
  try {
    const url = `${API_SUBJECTS_IT}/${serverId}`;
    const payload = { courseCode: newCode, courseTitle: newName };
    console.debug("Sending PUT to server", { url, payload });

    const resp = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let json: any = null;
    try {
      json = await resp.json();
    } catch (parseErr) {
      console.error("Failed to parse JSON response from PUT", parseErr);
    }

    console.debug("PUT response", { status: resp.status, ok: resp.ok, body: json });

    if (!resp.ok) {
      console.error("Server returned non-OK from PUT", { status: resp.status, body: json });
      showSnack(json?.message ?? "Failed to update subject", "error");
      setEditSaving(false);
      return;
    }

    const updated = json?.data ?? json;
    const updatedCode = normalizeCode(updated?.courseCode ?? newCode);
    const updatedTitle = normalizeTitle(updated?.courseTitle ?? newName);

    console.debug("Applying update to local state", { serverId, updated });

    // Update state matching either _id or the local id (fallback)
    setSubjects((s) =>
      s.map((x) =>
        (x._id && x._id === serverId) || x.id === editingSubject.id
          ? { ...x, _id: serverId, code: updatedCode, name: updatedTitle }
          : x
      )
    );

    showSnack("Subject updated", "success");
    closeEditDialog();
  } catch (err) {
    console.error("Edit subject error (network/exception):", err, { serverId });
    setSubjects(prev);
    showSnack("Network error while updating subject", "error");
  } finally {
    setEditSaving(false);
  }
};


  // Filtered subjects by search term
  const filteredSubjects = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [subjects, searchTerm]);

  // Filtered sections by the one-line search bar
  const filteredSections = useMemo(() => {
    const q = sectionsSearch.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (sec) =>
        String(sec.section ?? "").toLowerCase().includes(q) ||
        String(sec.block ?? "").toLowerCase().includes(q) ||
        String(sec.course ?? "").toLowerCase().includes(q)
    );
  }, [sections, sectionsSearch]);

  // Add Section -> POST /add-section (uses FIXED_COLLEGE_ID)
  const handleAddSection = async () => {
    const course = courseStored?.trim();
    const collegeId = FIXED_COLLEGE_ID;

    if (!course) {
      showSnack("No stored course found. Please set course in localStorage first.", "warning");
      return;
    }
    if (!newSection.trim()) {
      showSnack("Please enter a section.", "warning");
      return;
    }

    setAddingSection(true);

    // optimistic local item
    const tempId = `local-${Date.now()}`;
    const newSecLocal: Section = {
      _id: tempId,
      course,
      section: newSection.trim(),
      block: newBlock.trim() || undefined,
      college: collegeId,
      updatedAt: new Date().toISOString(),
    };
    setSections((s) => [newSecLocal, ...s]);
    setNewSection("");
    setNewBlock("");

    try {
      const resp = await fetch(API_ADD_SECTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course,
          section: newSecLocal.section,
          block: newSecLocal.block ?? null,
          college: collegeId,
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        // rollback optimistic add
        setSections((s) => s.filter((x) => x._id !== tempId));
        showSnack(json?.message ?? "Failed to add section", "error");
        setAddingSection(false);
        return;
      }

      const created = json?.data ?? json;
      // replace local item with server-backed item
      setSections((s) =>
        s.map((x) =>
          x._id === tempId
            ? {
                ...x,
                _id: created?._id ?? created?.id ?? x._id,
                course: created?.course ?? x.course,
                section: created?.section ?? x.section,
                block: created?.block ?? x.block,
                college: created?.college ?? x.college,
                createdAt: created?.createdAt ?? x.createdAt,
                updatedAt: created?.updatedAt ?? x.updatedAt,
              }
            : x
        )
      );

      showSnack("Section added", "success");
    } catch (err) {
      console.error("Add section error:", err);
      // rollback optimistic add
      setSections((s) => s.filter((x) => x._id !== tempId));
      showSnack("Network error while adding section", "error");
    } finally {
      setAddingSection(false);
    }
  };

  // Open edit dialog for section
  const openEditSectionDialog = (sec: Section) => {
    setEditingSection(sec);
    setEditSectionValue(sec.section ?? "");
    setEditBlockValue(sec.block ?? "");
    setEditSectionDialogOpen(true);
  };

  const closeEditSectionDialog = () => {
    setEditSectionDialogOpen(false);
    setEditingSection(null);
    setEditSectionValue("");
    setEditBlockValue("");
    setEditSectionSaving(false);
  };

  // Save edit section -> PUT /:id (sends FIXED_COLLEGE_ID)
  const handleSaveEditSection = async () => {
    if (!editingSection) return;
    if (!editingSection._id) {
      showSnack("Cannot edit: section id missing", "warning");
      closeEditSectionDialog();
      return;
    }

    // validate
    if (!editSectionValue.trim()) {
      showSnack("Section cannot be empty", "warning");
      return;
    }

    setEditSectionSaving(true);

    const prevSections = sections;
    // optimistic local update
    setSections((s) =>
      s.map((x) =>
        x._id === editingSection._id ? { ...x, section: editSectionValue.trim(), block: editBlockValue.trim() || undefined } : x
      )
    );

    try {
      const resp = await fetch(`${API_SECTION_ROOT}/${editingSection._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: editSectionValue.trim(),
          block: editBlockValue.trim() || null,
          college: FIXED_COLLEGE_ID, // always send fixed college id
        }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        // rollback
        setSections(prevSections);
        showSnack(json?.message ?? "Failed to update section", "error");
        setEditSectionSaving(false);
        return;
      }

      const updated = json?.data ?? json;
      const trimmedBlock = editBlockValue.trim();

      // replace with server-backed updated doc (use ternary for block)
      setSections((s) =>
        s.map((x) =>
          x._id === editingSection._id
            ? {
                ...x,
                section: updated?.section ?? editSectionValue.trim(),
                block: updated?.block ?? (trimmedBlock === "" ? undefined : trimmedBlock),
                course: updated?.course ?? x.course,
                college: updated?.college ?? FIXED_COLLEGE_ID,
                updatedAt: updated?.updatedAt ?? new Date().toISOString(),
              }
            : x
        )
      );

      showSnack("Section updated", "success");
      closeEditSectionDialog();
    } catch (err) {
      console.error("Edit section error:", err);
      setSections(prevSections);
      showSnack("Network error while updating section", "error");
      setEditSectionSaving(false);
    }
  };

  // Delete section -> DELETE /:id
  const handleDeleteSection = async (sec: Section) => {
    const id = sec._id; // narrow the possibly-undefined id into a local variable
    if (!id) {
      showSnack("Cannot delete: section id missing", "warning");
      return;
    }

    // id is now a string (not undefined)
    setDeletingSectionId(id);
    const prev = sections;
    // optimistic removal
    setSections((s) => s.filter((x) => x._id !== id));

    try {
      const resp = await fetch(`${API_SECTION_ROOT}/${id}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok) {
        // rollback
        setSections(prev);
        showSnack(json?.message ?? "Failed to delete section", "error");
        setDeletingSectionId(null);
        return;
      }
      showSnack("Section deleted", "info");
    } catch (err) {
      console.error("Delete section error:", err);
      setSections(prev);
      showSnack("Network error while deleting section", "error");
    } finally {
      setDeletingSectionId(null);
    }
  };

  return (
    <AdminMain>
      <Box sx={{ p: { xs: 2, sm: 3 }, minHeight: "100vh" }}>
        {/* Header Section */}
        <Box 
          sx={{ 
            mb: 4,
            p: 3,
            backgroundColor: "#fff",
            borderRadius: 3,
            boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers sx={{ fontSize: 32 }} />
            </Box>
            <Box>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                Course & Block Management
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Manage sections, blocks, and subjects for your course
              </Typography>
            </Box>
          </Stack>
          
          {/* Course Display Badge */}
          {courseStored && (
            <Box
              sx={{
                mt: 2,
                display: "inline-flex",
                alignItems: "center",
                gap: 1,
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: "#f1f3f4",
                color: "#1a1a1a",
              }}
            >
              <School fontSize="small" />
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Current Course: <strong>{courseStored.toUpperCase()}</strong>
              </Typography>
            </Box>
          )}
        </Box>

        <Grid container spacing={3}>
          {/* Left: Sections */}
          <Grid item xs={12} md={6}>
            <Card 
              sx={{ 
                height: "100%", 
                display: "flex", 
                flexDirection: "column",
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: "#fff",
              }}
            >
              <Box
                sx={{
                  backgroundColor: "#fff",
                  p: 2,
                  borderBottom: "1px solid #e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Group sx={{ fontSize: 28, color: "#1a1a1a" }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Sections & Blocks
                </Typography>
              </Box>
              <CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", p: 3 }}>

                {/* Search bar */}
                <Box sx={{ mb: 3 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search sections by section, block, or course..."
                    value={sectionsSearch}
                    onChange={(e) => setSectionsSearch(e.target.value)}
                    InputProps={{
                      startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
                      sx: { borderRadius: 2 },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "&:hover fieldset": {
                          borderColor: "primary.main",
                        },
                      },
                    }}
                  />
                </Box>

                {/* Add Section Form */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    mb: 3,
                    bgcolor: "grey.50",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: "text.secondary" }}>
                    Add New Section
                  </Typography>
                  <Grid container spacing={2} alignItems="flex-end">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Section"
                        value={newSection}
                        onChange={(e) => setNewSection(e.target.value)}
                        placeholder="e.g. 1"
                        InputProps={{
                          startAdornment: <Class sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "white",
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Block"
                        value={newBlock}
                        onChange={(e) => setNewBlock(e.target.value)}
                        placeholder="e.g. B"
                        InputProps={{
                          startAdornment: <BlockIcon sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "white",
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<Add />}
                        onClick={handleAddSection}
                        disabled={addingSection}
                        sx={{
                          py: 1.2,
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 600,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                          "&:hover": {
                            boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
                          },
                        }}
                      >
                        {addingSection ? "Adding..." : "Add Section"}
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>

                <TableContainer 
                  component={Paper} 
                  variant="outlined" 
                  sx={{ 
                    maxHeight: 420,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: "#f1f3f4" }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Class fontSize="small" />
                            <span>Section</span>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <BlockIcon fontSize="small" />
                            <span>Block</span>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {loadingSections ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            <CircularProgress />
                          </TableCell>
                        </TableRow>
                      ) : filteredSections.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            <Stack spacing={1} alignItems="center">
                              <Group sx={{ fontSize: 48, color: "text.secondary", opacity: 0.5 }} />
                              <Typography variant="body2" color="text.secondary">
                                {sectionsSearch 
                                  ? "No sections match your search." 
                                  : courseStored 
                                    ? "No sections found. Use the form above to add one." 
                                    : "No stored course to load sections."}
                              </Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSections.map((sec, idx) => (
                          <TableRow 
                            key={sec._id ?? `${sec.course}-${sec.section}`} 
                            hover
                            sx={{
                              backgroundColor: idx % 2 === 0 ? "#fafafa" : "white",
                              transition: "background-color 0.2s ease",
                              "&:hover": {
                                backgroundColor: "#f1f3f4",
                              },
                            }}
                          >
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {sec.section ?? "—"}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              {sec.block ? (
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    px: 1.5,
                                    py: 0.5,
                                    borderRadius: 1,
                                    bgcolor: "#f1f3f4",
                                    color: "#1a1a1a",
                                    fontWeight: 600,
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {sec.block}
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  —
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <IconButton 
                                  size="small" 
                                  onClick={() => openEditSectionDialog(sec)} 
                                  disabled={editSectionSaving}
                                  sx={{
                                    color: "#1a1a1a",
                                    "&:hover": { bgcolor: "#f1f3f4", color: "#1a1a1a" },
                                  }}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteSection(sec)}
                                  disabled={deletingSectionId === sec._id}
                                  sx={{
                                    color: "error.main",
                                    "&:hover": { bgcolor: "error.light", color: "error.dark" },
                                  }}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Right: Subjects */}
          <Grid item xs={12} md={6}>
            <Card 
              sx={{ 
                height: "100%", 
                display: "flex", 
                flexDirection: "column",
                boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
                borderRadius: 3,
                overflow: "hidden",
                backgroundColor: "#fff",
              }}
            >
              <Box
                sx={{
                  backgroundColor: "#fff",
                  p: 2,
                  borderBottom: "1px solid #e0e0e0",
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Book sx={{ fontSize: 28, color: "#1a1a1a" }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: "#1a1a1a" }}>
                  Subjects
                </Typography>
              </Box>
              <CardContent sx={{ flexGrow: 1, display: "flex", flexDirection: "column", p: 3 }}>
                {/* Search bar */}
                <Box sx={{ mb: 3 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search subjects by code or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                      startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
                      sx: { borderRadius: 2 },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        "&:hover fieldset": {
                          borderColor: "primary.main",
                        },
                      },
                    }}
                  />
                </Box>

                {/* Add Subject Form */}
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    mb: 3,
                    bgcolor: "#fafafa",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "#e0e0e0",
                  }}
                >
                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: "text.secondary" }}>
                    Add New Subject
                  </Typography>
                  <Grid container spacing={2} alignItems="flex-end">
                    <Grid item xs={12} sm={5}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Subject Code"
                        value={subjectCode}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectCode(e.target.value)}
                        placeholder="e.g. IT 101"
                        InputProps={{
                          startAdornment: <Article sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "white",
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={5}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Subject Name"
                        value={subjectName}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectName(e.target.value)}
                        placeholder="e.g. Introduction to IT"
                        InputProps={{
                          startAdornment: <Category sx={{ mr: 1, color: "text.secondary", fontSize: 20 }} />,
                        }}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "white",
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12} sm={2}>
                      <Button 
                        variant="contained" 
                        fullWidth 
                        startIcon={<Add />} 
                        onClick={handleAddSubject}
                        sx={{
                          py: 1.2,
                          borderRadius: 2,
                          textTransform: "none",
                          fontWeight: 600,
                          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                          "&:hover": {
                            boxShadow: "0 4px 8px rgba(0,0,0,0.15)",
                          },
                        }}
                      >
                        Add
                      </Button>
                    </Grid>
                  </Grid>
                </Paper>

                <TableContainer 
                  component={Paper} 
                  variant="outlined" 
                  sx={{ 
                    maxHeight: 420,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: "#f1f3f4" }}>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Article fontSize="small" />
                            <span>Code</span>
                          </Stack>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Category fontSize="small" />
                            <span>Subject</span>
                          </Stack>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {loadingSubjects ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            <CircularProgress />
                          </TableCell>
                        </TableRow>
                      ) : filteredSubjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            <Stack spacing={1} alignItems="center">
                              <Book sx={{ fontSize: 48, color: "text.secondary", opacity: 0.5 }} />
                              <Typography variant="body2" color="text.secondary">
                                {searchTerm 
                                  ? "No subjects match your search." 
                                  : "No subjects found. Use the form above to add one."}
                              </Typography>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSubjects.map((s, idx) => (
                          <TableRow 
                            key={s._id ?? s.id} 
                            hover
                            sx={{
                              backgroundColor: idx % 2 === 0 ? "#fafafa" : "white",
                              transition: "background-color 0.2s ease",
                              "&:hover": {
                                backgroundColor: "#f1f3f4",
                              },
                            }}
                          >
                            <TableCell>
                              <Box
                                sx={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  px: 1.5,
                                  py: 0.5,
                                  borderRadius: 1,
                                  bgcolor: "#f1f3f4",
                                  color: "#1a1a1a",
                                  fontWeight: 600,
                                  fontSize: "0.75rem",
                                }}
                              >
                                {s.code}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {s.name}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <IconButton 
                                  size="small" 
                                  onClick={() => openEditDialog(s)}
                                  sx={{
                                    color: "#1a1a1a",
                                    "&:hover": { bgcolor: "#f1f3f4", color: "#1a1a1a" },
                                  }}
                                >
                                  <Edit fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={() => handleDeleteSubject(s)}
                                  sx={{
                                    color: "error.main",
                                    "&:hover": { bgcolor: "error.light", color: "error.dark" },
                                  }}
                                >
                                  <Delete fontSize="small" />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Edit Subject Dialog */}
        <Dialog 
          open={editDialogOpen} 
          onClose={closeEditDialog} 
          fullWidth 
          maxWidth="sm"
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle sx={{ backgroundColor: "#fff", color: "#1a1a1a", fontWeight: 700, borderBottom: "1px solid #e0e0e0" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Edit sx={{ color: "#1a1a1a" }} />
              <span>Edit Subject</span>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <TextField
              margin="dense"
              label="Subject Code"
              fullWidth
              value={editCode}
              onChange={(e) => setEditCode(e.target.value)}
            />
            <TextField
              margin="dense"
              label="Subject Name"
              fullWidth
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDialog} disabled={editSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} variant="contained" disabled={editSaving}>
              {editSaving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Section Dialog */}
        <Dialog 
          open={editSectionDialogOpen} 
          onClose={closeEditSectionDialog} 
          fullWidth 
          maxWidth="xs"
          PaperProps={{
            sx: { borderRadius: 3 }
          }}
        >
          <DialogTitle sx={{ backgroundColor: "#fff", color: "#1a1a1a", fontWeight: 700, borderBottom: "1px solid #e0e0e0" }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Edit sx={{ color: "#1a1a1a" }} />
              <span>Edit Section</span>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <TextField
              margin="dense"
              label="Section"
              fullWidth
              value={editSectionValue}
              onChange={(e) => setEditSectionValue(e.target.value)}
            />
            <TextField
              margin="dense"
              label="Block"
              fullWidth
              value={editBlockValue}
              onChange={(e) => setEditBlockValue(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditSectionDialog} disabled={editSectionSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveEditSection} variant="contained" disabled={editSectionSaving}>
              {editSectionSaving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={snack.open}
          autoHideDuration={3000}
          onClose={handleCloseSnack}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <Alert onClose={handleCloseSnack} severity={snack.severity} sx={{ width: "100%" }}>
            {snack.message}
          </Alert>
        </Snackbar>
      </Box>
    </AdminMain>
  );
};

export default CourseBlockManagement;
