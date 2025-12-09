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
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  DialogContentText,
} from "@mui/material";
import { Add, Edit, Delete, Layers, ArrowDropDown } from "@mui/icons-material";
import DeanMain from "./DeanMain";

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
  courseId: number;
};

type SnackState = {
  open: boolean;
  message: string;
  severity: AlertColor;
};

const API_SUBJECTS_IT = "http://localhost:5000/api/auth/subjects-it";
const API_DEAN_SUBJECTS_BY_COURSE = "http://localhost:5000/api/auth/dean-subjects-by-course";
const API_DEAN_SECTIONS = "http://localhost:5000/api/auth/dean-all-sections";
const API_ADD_SECTION = "http://localhost:5000/api/auth/add-section";
// NOTE: backend edit/delete routes assumed to be mounted at /api/auth/sections/:id
const API_SECTION_BASE = "http://localhost:5000/api/auth";

const LOCAL_KEYS = ["selectedCourse", "course", "currentCourse", "courseCode"];
const LOCAL_COLLEGE_KEYS = ["collegeId", "selectedCollegeId", "college", "selectedCollege"];

/* DEFAULT FIXED COLLEGE ID */
const FIXED_COLLEGE_ID = "67ff627e2fb6583dc49dccef";

const DeanCourseBlockManagement: React.FC = () => {
  // stored course read from localStorage (display-only)
  const [courseStored, setCourseStored] = useState<string | null>(null);
  // stored college read from localStorage (code or id) - used to request sections
  /* default collegeStored to FIXED_COLLEGE_ID so adding uses it by default */
  const [collegeStored, setCollegeStored] = useState<string | null>(FIXED_COLLEGE_ID);

  // sections state (fetched from /dean-all-sections)
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState<boolean>(false);

  // adding section state
  const [addSaving, setAddSaving] = useState<boolean>(false);

  // search input for filtering sections (client-side)
  const [sectionsSearch, setSectionsSearch] = useState<string>("");

  // inputs for adding a new section/block
  const [newSection, setNewSection] = useState<string>("");
  const [newBlock, setNewBlock] = useState<string>("");

  // COURSE selector for sections: choices BSIT | BSIS
  const [sectionCourse, setSectionCourse] = useState<"BSIT" | "BSIS">("BSIT");

  // --- Section edit dialog state ---
  const [editSectionDialogOpen, setEditSectionDialogOpen] = useState<boolean>(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editSectionCourse, setEditSectionCourse] = useState<"BSIT" | "BSIS">("BSIT");
  const [editSectionVal, setEditSectionVal] = useState<string>("");
  const [editBlockVal, setEditBlockVal] = useState<string>("");
  const [editSectionSaving, setEditSectionSaving] = useState<boolean>(false);

  // Delete confirm dialog state (replaces window.confirm)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  // Subjects (right) - functional
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(false);

  // Form states (for adding subjects)
  const [subjectName, setSubjectName] = useState<string>("");
  const [subjectCode, setSubjectCode] = useState<string>("");

  // Search state for subjects
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Subject category filter (ALL | IT | IS)
  const [subjectCategory, setSubjectCategory] = useState<"ALL" | "IT" | "IS">("ALL");

  // Menu anchor for compact dropdown icon (subjects)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);
  const openCategoryMenu = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const closeCategoryMenu = () => setAnchorEl(null);
  const handleSelectCategory = (cat: "ALL" | "IT" | "IS") => {
    setSubjectCategory(cat);
    closeCategoryMenu();
  };

  // Snackbar
  const [snack, setSnack] = useState<SnackState>({ open: false, message: "", severity: "success" });

  // Edit dialog state for subjects (existing)
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [editCode, setEditCode] = useState<string>("");
  const [editName, setEditName] = useState<string>("");
  const [editSaving, setEditSaving] = useState<boolean>(false);

  const showSnack = (message: string, severity: AlertColor = "success") =>
    setSnack({ open: true, message, severity });
  const handleCloseSnack = () => setSnack((s) => ({ ...s, open: false }));

  // Helpers
  const normalizeCode = (code: string) => String(code).trim().replace(/\s+/g, " ").toUpperCase();
  const normalizeTitle = (t: string) => String(t ?? "").trim();
  const getCourseNameFromCode = (code: string) => {
    const match = String(code).trim().toUpperCase().match(/^([A-Z]{1,4})/);
    return match ? match[1] : "—";
  };

  // Read course & college from localStorage (tries several keys)
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

  // Fetch sections by college (passes the college string as `college` query param)
  const fetchSectionsByCollege = async (collegeQuery: string | null) => {
    setLoadingSections(true);
    try {
      // Prefer the college value stored in localStorage
      const storedCollege = readCollegeFromLocalStorage();
      // use stored college if available, otherwise use the passed param, otherwise fall back to fixed id
      const collegeToUse =
        (storedCollege && storedCollege.trim()) ||
        (collegeQuery && collegeQuery.trim()) ||
        FIXED_COLLEGE_ID;

      if (!collegeToUse || !String(collegeToUse).trim()) {
        setSections([]);
        return;
      }

      const url = `${API_DEAN_SECTIONS}?college=${encodeURIComponent(String(collegeToUse).trim())}`;
      const resp = await fetch(url);

      if (!resp.ok) {
        // read response body (safe) to get server message for debugging
        const text = await resp.text().catch(() => null);
        console.error("dean-all-sections fetch failed:", resp.status, resp.statusText, "body:", text);
        let parsedMsg: string | null = null;
        try {
          const parsed = text ? JSON.parse(text) : null;
          parsedMsg = parsed?.message ?? null;
        } catch (e) {
          // not JSON
        }
        throw new Error(parsedMsg ?? text ?? `Server returned ${resp.status}`);
      }

      const data = (await resp.json()) as Array<any>;

      const mapped: Section[] = (data ?? []).map((s: any) => ({
        _id: s._id,
        // normalize college value (could be populated object)
        college: typeof s.college === "string" ? s.college : s.college?._id ?? s.college?.id,
        course: s.course,
        section: s.section,
        block: s.block,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

      setSections(mapped);
    } catch (err: any) {
      console.error("Failed to fetch sections by college:", err);
      showSnack(`Failed to load sections from server: ${err?.message ?? "unknown"}`, "error");
      setSections([]);
    } finally {
      setLoadingSections(false);
    }
  };

  // Fetch subjects (existing behavior)
  const fetchSubjectsByCourse = async (course: string | null) => {
    setLoadingSubjects(true);
    try {
      const url = course && course.trim()
        ? `${API_DEAN_SUBJECTS_BY_COURSE}?course=${encodeURIComponent(course.trim())}`
        : API_DEAN_SUBJECTS_BY_COURSE;

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
      const data = (await resp.json()) as Array<any>;

      const mapped: Subject[] = (data ?? []).map((item: any, idx: number) => {
        const rawCode = item?.courseCode ?? item?.courseCodeNormalized ?? item?.code ?? "";
        const rawTitle = item?.courseTitle ?? item?.courseTitleNormalized ?? item?.title ?? item?.name ?? "";
        const normalizedCode = normalizeCode(String(rawCode));
        const normalizedTitle = normalizeTitle(String(rawTitle));
        let serverId: string | undefined = undefined;
        if (item) {
          if (typeof item._id === "string") serverId = item._id;
          else if (item._id && typeof item._id === "object" && item._id.$oid) serverId = item._id.$oid;
          else if (item._idStr && typeof item._idStr === "string") serverId = item._idStr;
          else if (item.id && typeof item.id === "string") serverId = item.id;
        }
        return {
          _id: serverId,
          id: Date.now() + idx,
          code: normalizedCode,
          name: normalizedTitle,
          courseId: 0,
        };
      });

      setSubjects(mapped);
    } catch (err) {
      console.error("Failed to fetch subjects by course (dean):", err);
      showSnack("Failed to load subjects from server", "error");
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  // On mount: read stored course and college from localStorage, fetch subjects and sections
  useEffect(() => {
    const storedCourse = readCourseFromLocalStorage();
    const storedCollege = readCollegeFromLocalStorage();

    // if college isn't found in localStorage, fall back to FIXED_COLLEGE_ID
    setCollegeStored(storedCollege ?? FIXED_COLLEGE_ID);
    setCourseStored(storedCourse ?? null);

    // if storedCourse matches BSIT/BSIS, default selector to that
    if (storedCourse) {
      const up = storedCourse.toUpperCase();
      if (up === "BSIT" || up === "BSIS") setSectionCourse(up as "BSIT" | "BSIS");
    }

    // fetch both resources (use FIXED_COLLEGE_ID as fallback)
    fetchSubjectsByCourse(storedCourse ?? null);
    fetchSectionsByCollege(storedCollege ?? FIXED_COLLEGE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When courseStored changes -> set subjectCode prefix and refetch subjects
  useEffect(() => {
    if (!courseStored) {
      setSubjectCode("");
      setSubjects([]);
      fetchSubjectsByCourse(null);
      return;
    }
    const cleaned = String(courseStored).trim();
    const lastTwo = cleaned.length >= 2 ? cleaned.slice(-2) : cleaned;
    const prefix = lastTwo.toUpperCase();
    setSubjectCode(prefix ? `${prefix} ` : "");
    fetchSubjectsByCourse(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseStored]);

  // When collegeStored changes -> refetch sections
  useEffect(() => {
    fetchSectionsByCollege(collegeStored ?? FIXED_COLLEGE_ID);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collegeStored]);

  // Add a section -> POST /add-section
  const handleAddSection = async (): Promise<void> => {
    // Validate inputs
    const course = (sectionCourse ?? "BSIT").toString().trim(); // use selector
    const sectionVal = String(newSection ?? "").trim();
    const blockVal = newBlock != null ? String(newBlock).trim() : undefined;

    // ALWAYS send the FIXED_COLLEGE_ID (do not use collegeStored as fallback)
    const college = FIXED_COLLEGE_ID;

    if (!course) {
      showSnack("Course is required.", "warning");
      return;
    }
    if (!sectionVal) {
      showSnack("Section is required.", "warning");
      return;
    }
    if (!college) {
      showSnack("College id is missing. Cannot add section.", "warning");
      return;
    }

    setAddSaving(true);
    try {
      const payload = {
        course: course.toUpperCase(),
        section: sectionVal,
        block: blockVal ?? null,
        college,
      };

      const resp = await fetch(API_ADD_SECTION, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // parse body safely
      const json = await resp.json().catch(() => null);

      if (resp.status === 409) {
        showSnack(json?.message ?? "Section already exists.", "warning");
        return;
      }

      if (!resp.ok) {
        showSnack(json?.message ?? `Failed to add section (status ${resp.status})`, "error");
        return;
      }

      const created = json?.data ?? json;

      // Normalize college returned by server: could be string or populated object
      const returnedCollege =
        typeof created?.college === "string"
          ? created.college
          : created?.college?._id ?? created?.college?.id ?? college;

      // map returned object to Section type
      const newSaved: Section = {
        _id: created?._id ?? created?.id ?? undefined,
        college: returnedCollege,
        course: created?.course ?? payload.course,
        section: created?.section ?? payload.section,
        block: created?.block ?? payload.block,
        createdAt: created?.createdAt,
        updatedAt: created?.updatedAt,
      };

      // insert into UI list (prepend)
      setSections((s) => [newSaved, ...s]);

      // clear inputs
      setNewSection("");
      setNewBlock("");

      showSnack("Section added", "success");
    } catch (err) {
      console.error("Add section error:", err);
      showSnack("Network error while adding section", "error");
    } finally {
      setAddSaving(false);
    }
  };

  // Open section edit dialog (prefill)
  const openEditSectionDialog = (s: Section) => {
    setEditingSection(s);
    setEditSectionCourse((s.course === "BSIS" ? "BSIS" : "BSIT") as "BSIT" | "BSIS");
    setEditSectionVal(s.section ?? "");
    setEditBlockVal(s.block ?? "");
    setEditSectionDialogOpen(true);
  };

  const closeEditSectionDialog = () => {
    setEditingSection(null);
    setEditSectionCourse("BSIT");
    setEditSectionVal("");
    setEditBlockVal("");
    setEditSectionDialogOpen(false);
    setEditSectionSaving(false);
  };

  // Save section edit -> PUT /sections/:id
  const handleSaveSectionEdit = async (): Promise<void> => {
    if (!editingSection || !editingSection._id) return;

    const id = editingSection._id;
    const payload: any = {
      course: editSectionCourse,
      section: String(editSectionVal ?? "").trim(),
      block: editBlockVal != null ? (String(editBlockVal).trim() || null) : undefined,
      // include college as the fixed id so backend receives valid ObjectId if you want
      college: FIXED_COLLEGE_ID,
    };

    if (!payload.section) {
      showSnack("Section value is required.", "warning");
      return;
    }

    setEditSectionSaving(true);
    try {
      const resp = await fetch(`${API_SECTION_BASE}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        showSnack(json?.message ?? `Failed to update section (status ${resp.status})`, "error");
        setEditSectionSaving(false);
        return;
      }

      const updated = json?.data ?? json;

      // Normalize returned college value
      const returnedCollege =
        typeof updated?.college === "string" ? updated.college : updated?.college?._id ?? updated?.college?.id ?? FIXED_COLLEGE_ID;

      const updatedSection: Section = {
        _id: updated?._id ?? updated?.id ?? id,
        college: returnedCollege,
        course: updated?.course ?? payload.course,
        section: updated?.section ?? payload.section,
        block: updated?.block ?? payload.block,
        createdAt: updated?.createdAt,
        updatedAt: updated?.updatedAt,
      };

      setSections((curr) => curr.map((x) => (x._id === updatedSection._id ? updatedSection : x)));

      showSnack("Section updated", "success");
      closeEditSectionDialog();
    } catch (err) {
      console.error("Error updating section:", err);
      showSnack("Network error while updating section", "error");
      setEditSectionSaving(false);
    }
  };

  // -------- Delete section flow using dialog (replaces window.confirm) --------
  const openDeleteDialog = (s: Section) => {
    setDeletingSection(s);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setDeletingSection(null);
    setDeleteLoading(false);
  };

  const confirmDeleteSection = async () => {
    if (!deletingSection) {
      closeDeleteDialog();
      return;
    }
    const id = deletingSection._id;
    if (!id) {
      showSnack("Cannot delete: missing section id", "warning");
      closeDeleteDialog();
      return;
    }

    setDeleteLoading(true);
    try {
      const resp = await fetch(`${API_SECTION_BASE}/${id}`, { method: "DELETE" });
      const json = await resp.json().catch(() => null);

      if (!resp.ok) {
        showSnack(json?.message ?? `Failed to delete section (status ${resp.status})`, "error");
        return;
      }

      // remove from UI
      setSections((curr) => curr.filter((x) => x._id !== id));
      showSnack("Section deleted", "info");
      closeDeleteDialog();
    } catch (err) {
      console.error("Delete section error:", err);
      showSnack("Network error while deleting section", "error");
    } finally {
      setDeleteLoading(false);
    }
  };
  // ---------------------------------------------------------------------------

  // Add subject (existing)
  const handleAddSubject = async (): Promise<void> => {
    if (!subjectName.trim() || !subjectCode.trim()) {
      showSnack("Please provide subject code and name.", "warning");
      return;
    }
    const normalizedCode = normalizeCode(subjectCode);
    const normalizedTitle = normalizeTitle(subjectName);
    const tempId = Date.now() + Math.floor(Math.random() * 1000);
    const newSubjectLocal: Subject = { id: tempId, code: normalizedCode, name: normalizedTitle, courseId: 0 };
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
            ? { ...x, _id: serverId, code: normalizeCode(serverCourseCode), name: normalizeTitle(serverCourseTitle) }
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

  // Delete subject (existing)
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

  // Open edit dialog (existing)
  const openEditDialog = (subject: Subject) => {
    const fromState = subjects.find((s) => (subject._id ? s._id === subject._id : s.id === subject.id)) ?? subject;
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

  // Save edit (existing)
  const handleSaveEdit = async () => {
    if (!editingSubject) return;
    const newCode = normalizeCode(editCode);
    const newName = normalizeTitle(editName);
    if (!newCode || !newName) {
      showSnack("Code and name are required", "warning");
      return;
    }

    let serverId: string | undefined;
    if (editingSubject._id) serverId = editingSubject._id;
    if (!serverId) {
      const byLocalId = subjects.find((s) => s.id === editingSubject.id)?._id;
      if (byLocalId) serverId = byLocalId;
    }
    if (!serverId) {
      const byCodeName = subjects.find((s) => s.code === editingSubject.code && s.name === editingSubject.name)?._id;
      if (byCodeName) serverId = byCodeName;
    }

    if (!serverId) {
      setSubjects((s) => s.map((x) => (x.id === editingSubject.id ? { ...x, code: newCode, name: newName } : x)));
      showSnack("Updated locally (server id missing). Refresh or re-fetch to persist.", "warning");
      closeEditDialog();
      return;
    }
    setEditSaving(true);
    const prev = subjects;
    try {
      const url = `${API_SUBJECTS_IT}/${serverId}`;
      const payload = { courseCode: newCode, courseTitle: newName };
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
      if (!resp.ok) {
        showSnack(json?.message ?? "Failed to update subject", "error");
        setEditSaving(false);
        return;
      }
      const updated = json?.data ?? json;
      const updatedCode = normalizeCode(updated?.courseCode ?? newCode);
      const updatedTitle = normalizeTitle(updated?.courseTitle ?? newName);
      const updatedId = updated?._id ?? serverId;
      setSubjects((s) =>
        s.map((x) =>
          (x._id && x._id === updatedId) || x.id === editingSubject.id
            ? { ...x, _id: updatedId, code: updatedCode, name: updatedTitle }
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

  // Apply category filter (ALL | IT | IS)
  const displayedSubjects = useMemo(() => {
    if (subjectCategory === "ALL") return filteredSubjects;
    return filteredSubjects.filter((s) => {
      const prefix = getCourseNameFromCode(s.code).toUpperCase();
      return prefix === subjectCategory;
    });
  }, [filteredSubjects, subjectCategory]);

  // Filter sections by sectionsSearch
  const filteredSections = useMemo(() => {
    const q = sectionsSearch.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (s) =>
        String(s.course ?? "").toLowerCase().includes(q) ||
        String(s.section ?? "").toLowerCase().includes(q) ||
        String(s.block ?? "").toLowerCase().includes(q)
    );
  }, [sections, sectionsSearch]);

  return (
    <DeanMain>
      <Box sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <Layers sx={{ fontSize: 36 }} />
          <Typography variant="h4" component="h1">
            Section & Subject Management
          </Typography>
        </Stack>

        <Grid container spacing={3}>
          {/* Left: Sections (now functional - loads from backend) */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Sections
                </Typography>

                {/* One-line search bar (filters loaded sections) */}
                <Box sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search sections by course, section, block..."
                    value={sectionsSearch}
                    onChange={(e) => setSectionsSearch(e.target.value)}
                    InputProps={{ "aria-label": "search-sections" }}
                  />
                </Box>

                {/* Row: course selector (BSIT/BSIS) | section input | block input | add button */}
                <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Grid item xs={12} sm={5}>
                    <FormControl fullWidth size="small">
                      <InputLabel id="section-course-label">Course</InputLabel>
                      <Select
                        labelId="section-course-label"
                        value={sectionCourse}
                        label="Course"
                        onChange={(e) => setSectionCourse(e.target.value as "BSIT" | "BSIS")}
                      >
                        <MenuItem value="BSIT">BSIT</MenuItem>
                        <MenuItem value="BSIS">BSIS</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={6} sm={3}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Section"
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      placeholder="e.g. 1"
                    />
                  </Grid>

                  <Grid item xs={4} sm={2}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Block"
                      value={newBlock}
                      onChange={(e) => setNewBlock(e.target.value)}
                      placeholder="e.g. B (optional)"
                    />
                  </Grid>

                  <Grid item xs={2} sm={2}>
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={addSaving ? <CircularProgress size={18} /> : <Add />}
                      onClick={handleAddSection}
                      disabled={addSaving}
                    >
                      {addSaving ? "Adding..." : "Add"}
                    </Button>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Course</TableCell>
                        <TableCell>Section</TableCell>
                        <TableCell>Block</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {loadingSections ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                            <CircularProgress />
                          </TableCell>
                        </TableRow>
                      ) : filteredSections.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                            No sections found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredSections.map((s) => (
                          <TableRow key={s._id ?? `${s.course}-${s.section}-${s.block}`} hover>
                            <TableCell>{s.course}</TableCell>
                            <TableCell>{s.section}</TableCell>
                            <TableCell>{s.block}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => openEditSectionDialog(s)}>
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => openDeleteDialog(s)}
                                sx={{ ml: 1 }}
                                aria-label={`delete-${s.course}-${s.section}`}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
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

          {/* Right: Subjects (unchanged behavior) */}
          <Grid item xs={12} md={6}>
            <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Subjects
                </Typography>

                {/* Search bar */}
                <Box sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    placeholder="Search subjects by code or name..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ "aria-label": "search-subjects" }}
                  />
                </Box>

                {/* Inputs: Subject Code | Subject Name + Add button */}
                <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
                  <Grid item xs={4}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Subject Code"
                      value={subjectCode}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectCode(e.target.value)}
                      placeholder="e.g. IT 101"
                    />
                  </Grid>

                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Subject Name"
                      value={subjectName}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectName(e.target.value)}
                      placeholder="e.g. Introduction to Information Technology"
                    />
                  </Grid>

                  <Grid item xs={2}>
                    <Button variant="contained" fullWidth startIcon={<Add />} onClick={handleAddSubject}>
                      Add
                    </Button>
                  </Grid>
                </Grid>

                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Code</TableCell>
                        <TableCell sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <span>Subject</span>
                          {/* compact icon-only dropdown */}
                          <IconButton
                            size="small"
                            onClick={openCategoryMenu}
                            aria-label="subject-filter"
                            aria-controls={menuOpen ? "subject-filter-menu" : undefined}
                            aria-haspopup="true"
                            aria-expanded={menuOpen ? "true" : undefined}
                          >
                            <ArrowDropDown fontSize="small" />
                          </IconButton>

                          <Menu
                            id="subject-filter-menu"
                            anchorEl={anchorEl}
                            open={menuOpen}
                            onClose={closeCategoryMenu}
                            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                            transformOrigin={{ vertical: "top", horizontal: "left" }}
                          >
                            <MenuItem selected={subjectCategory === "ALL"} onClick={() => handleSelectCategory("ALL")}>
                              ALL
                            </MenuItem>
                            <MenuItem selected={subjectCategory === "IT"} onClick={() => handleSelectCategory("IT")}>
                              IT
                            </MenuItem>
                            <MenuItem selected={subjectCategory === "IS"} onClick={() => handleSelectCategory("IS")}>
                              IS
                            </MenuItem>
                          </Menu>
                        </TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {loadingSubjects ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            <CircularProgress />
                          </TableCell>
                        </TableRow>
                      ) : displayedSubjects.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 6 }}>
                            No subjects found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedSubjects.map((s) => (
                          <TableRow key={s._id ?? s.id} hover>
                            <TableCell>{s.code}</TableCell>
                            <TableCell>{s.name}</TableCell>
                            <TableCell align="right">
                              <IconButton size="small" onClick={() => openEditDialog(s)}>
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteSubject(s)}
                                sx={{ ml: 1 }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
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

        {/* Section Edit Dialog */}
        <Dialog open={editSectionDialogOpen} onClose={closeEditSectionDialog} fullWidth maxWidth="sm">
          <DialogTitle>Edit Section</DialogTitle>
          <DialogContent>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel id="edit-section-course-label">Course</InputLabel>
              <Select
                labelId="edit-section-course-label"
                value={editSectionCourse}
                label="Course"
                onChange={(e) => setEditSectionCourse(e.target.value as "BSIT" | "BSIS")}
              >
                <MenuItem value="BSIT">BSIT</MenuItem>
                <MenuItem value="BSIS">BSIS</MenuItem>
              </Select>
            </FormControl>

            <TextField
              margin="dense"
              label="Section"
              fullWidth
              value={editSectionVal}
              onChange={(e) => setEditSectionVal(e.target.value)}
            />
            <TextField
              margin="dense"
              label="Block (optional)"
              fullWidth
              value={editBlockVal}
              onChange={(e) => setEditBlockVal(e.target.value)}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditSectionDialog} disabled={editSectionSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveSectionEdit} variant="contained" disabled={editSectionSaving}>
              {editSectionSaving ? "Saving..." : "Save"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Confirmation Dialog (replaces window.confirm) */}
        <Dialog
          open={deleteDialogOpen}
          onClose={closeDeleteDialog}
          aria-labelledby="confirm-delete-title"
          aria-describedby="confirm-delete-description"
        >
          <DialogTitle id="confirm-delete-title">Confirm delete</DialogTitle>
          <DialogContent>
            <DialogContentText id="confirm-delete-description">
              {deletingSection
                ? `Delete section ${deletingSection.course} ${deletingSection.section}${deletingSection.block ? ` - ${deletingSection.block}` : ""}?`
                : "Delete this section?"}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDeleteDialog} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button onClick={confirmDeleteSection} variant="contained" disabled={deleteLoading} autoFocus>
              {deleteLoading ? <CircularProgress size={20} /> : "Delete"}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Edit Subject Dialog */}
        <Dialog open={editDialogOpen} onClose={closeEditDialog} fullWidth maxWidth="sm">
          <DialogTitle>Edit Subject</DialogTitle>
          <DialogContent>
            <TextField margin="dense" label="Subject Code" fullWidth value={editCode} onChange={(e) => setEditCode(e.target.value)} />
            <TextField margin="dense" label="Subject Name" fullWidth value={editName} onChange={(e) => setEditName(e.target.value)} />
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

        <Snackbar open={snack.open} autoHideDuration={3000} onClose={handleCloseSnack} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
          <Alert onClose={handleCloseSnack} severity={snack.severity} sx={{ width: "100%" }}>
            {snack.message}
          </Alert>
        </Snackbar>
      </Box>
    </DeanMain>
  );
};

export default DeanCourseBlockManagement;
