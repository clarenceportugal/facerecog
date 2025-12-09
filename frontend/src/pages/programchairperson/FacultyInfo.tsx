import React, { useState, useEffect } from "react";
import axios from "axios";
import AdminMain from "./AdminMain";
import Swal from "sweetalert2";
import AddIcon from "@mui/icons-material/Add";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import EditIcon from "@mui/icons-material/Edit";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import { useFacultyContext } from "../../context/FacultyContext";
import { API_BASE_URL } from "../../utils/api";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Grid,
  IconButton,
  TextField,
  MenuItem,
  Menu,
  Chip,
  TablePagination,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
} from "@mui/material";
import InfoModal from "../../components/InfoModal";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AddFacultyModal from "../../components/AddFacultyModal";

const FacultyInfo: React.FC = () => {
  // read course/college from localStorage
  const CourseName = localStorage.getItem("course") ?? "";
  const CollegeName = localStorage.getItem("college") ?? "";
  const { facultyList, setFacultyList } = useFacultyContext();
  const [openModal, setOpenModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newFaculty, setNewFaculty] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    username: "",
    email: "",
    password: "",
    role: "instructor",
    college: CollegeName,
    course: CourseName,
    highestEducationalAttainment: "",
    academicRank: "",
    statusOfAppointment: "",
    numberOfPrep: 0,
    totalTeachingLoad: 0,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [statusAnchorEl, setStatusAnchorEl] = useState<null | HTMLElement>(null);

  // Menu anchor & selected faculty for the 3-dot menu
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedFacultyInfo, setSelectedFacultyInfo] = useState<any>(null);

  // loading state when updating status
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // NEW: view/edit dialog state (now modal manages form locally)
  const [viewDialogOpen, setViewDialogOpen] = useState(false);

  // Save loading + field-level errors from server validation
  const [saveLoading, setSaveLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const statusMenuOpen = Boolean(statusAnchorEl);

  const handleStatusSelect = (status: string) => {
    setSelectedStatus(status);
    handleStatusClose();
  };

  const handleStatusClick = (event: React.MouseEvent<HTMLElement>) => {
    setStatusAnchorEl(event.currentTarget);
  };

  const handleStatusClose = () => {
    setStatusAnchorEl(null);
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  const random4Digit = (): string => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const handleOpenModal = () => {
    setNewFaculty({
      last_name: "",
      first_name: "",
      middle_name: "",
      username: "",
      email: "",
      password: random4Digit(),
      role: "instructor",
      college: CollegeName,
      course: CourseName,
      highestEducationalAttainment: "",
      academicRank: "",
      statusOfAppointment: "",
      numberOfPrep: 0,
      totalTeachingLoad: 0,
    });
    setOpenModal(true);
  };

  const handleCloseModal = (resetForm = true) => {
    setOpenModal(false);
    if (resetForm) {
      setNewFaculty({
        last_name: "",
        first_name: "",
        middle_name: "",
        username: "",
        email: "",
        password: "",
        role: "instructor",
        college: "",
        course: "",
        highestEducationalAttainment: "",
        academicRank: "",
        statusOfAppointment: "",
        numberOfPrep: 0,
        totalTeachingLoad: 0,
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewFaculty((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (event: any) => {
    setNewFaculty((prev) => ({ ...prev, role: event.target.value }));
  };

  const handleAddAccount = async () => {
    if (
      !newFaculty.last_name.trim() ||
      !newFaculty.first_name.trim() ||
      !newFaculty.email.trim() ||
      !newFaculty.password.trim()
    ) {
      handleCloseModal(false);
      Swal.fire({
        icon: "warning",
        title: "Missing Fields",
        text: "Please fill out all required fields.",
        timer: 2000,
        timerProgressBar: true,
        willClose: () => {
          setOpenModal(true);
        },
      });
      return;
    }

    try {
      console.log('[ADD FACULTY] Sending request to:', `${API_BASE_URL}/api/auth/faculty`);
      console.log('[ADD FACULTY] Data:', newFaculty);

      const res = await axios.post(`${API_BASE_URL}/api/auth/faculty`, newFaculty);
      const created = res.data?.data ?? res.data;

      console.log('[ADD FACULTY] Success:', created);
      setFacultyList([...facultyList, created]);

      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Faculty account added successfully!",
      });
      handleCloseModal();
    } catch (error: any) {
      handleCloseModal(false);
      console.error("[ADD FACULTY] Error:", error);
      console.error("[ADD FACULTY] Error response:", error.response?.data);

      const msg = error.response?.data?.message || "Failed to add faculty account. Check console for details.";
      Swal.fire({
        icon: "error",
        title: "Error",
        text: msg,
        timer: 2000,
        timerProgressBar: true,
        willClose: () => {
          setOpenModal(true);
        },
      });
    }
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const filteredFacultyList = facultyList.filter((faculty) => {
    const fullName = `${faculty.last_name}, ${faculty.first_name} ${faculty.middle_name || ""}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery) ||
      faculty.username.toLowerCase().includes(searchQuery) ||
      faculty.email.toLowerCase().includes(searchQuery);

    const matchesStatus = selectedStatus === "all" || faculty.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const [openInfoModal, setOpenInfoModal] = useState(false);

  const handleOpenInfoModal = (faculty: any) => {
    setSelectedFacultyInfo(faculty);
    setOpenInfoModal(true);
  };

  const handleCloseInfoModal = () => {
    setSelectedFacultyInfo(null);
    setOpenInfoModal(false);
  };

  const generateUsername = (firstName: string, lastName: string) => {
    const first = firstName.substring(0, 3).toUpperCase();
    const last = lastName.substring(0, 3).toUpperCase();
    return last + first;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newFaculty.first_name && newFaculty.last_name) {
        const username = generateUsername(newFaculty.first_name, newFaculty.last_name);
        setNewFaculty((prev) => ({ ...prev, username }));
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [newFaculty.first_name, newFaculty.last_name]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedFacultyList = filteredFacultyList.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  // --- New handlers for the changed menu items ---
  const openThreeDotMenu = (e: React.MouseEvent<HTMLElement>, faculty: any) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
    setSelectedFacultyInfo(faculty);
  };

  const closeThreeDotMenu = () => {
    setAnchorEl(null);
  };

  // Open edit modal: set the selectedFacultyInfo and open modal.
  // The modal will copy the faculty into its own local state (no parent updates during typing).
  const handleEditFromMenu = () => {
    if (!selectedFacultyInfo) {
      closeThreeDotMenu();
      return;
    }

    // just reset errors and open modal - modal will initialize its own form from selectedFacultyInfo
    setFieldErrors({});
    setViewDialogOpen(true);
    closeThreeDotMenu();
  };

  const closeViewDialog = () => {
    // clear selectedFacultyInfo? keep it for InfoModal; we keep it but close the edit modal only
    setFieldErrors({});
    setViewDialogOpen(false);
  };

  // server-save handler that receives the modal's local form
  const handleSaveEditWithForm = async (form: any) => {
    if (!form) return;

    if (!form.last_name?.trim() || !form.first_name?.trim() || !form.email?.trim()) {
      Swal.fire({ icon: "warning", title: "Missing fields", text: "First name, last name and email are required." });
      return;
    }

    const id = form._id;
    if (!id) {
      Swal.fire({ icon: "error", title: "Error", text: "No faculty id available." });
      return;
    }

    setSaveLoading(true);
    setFieldErrors({});

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const payload: any = { ...form };
      delete payload._id;
      delete payload.password;

      // keep existing behavior for college
      if (payload.college === "") payload.college = null;

      // --- NEW: force course in payload to value from localStorage ---
      const courseFromLocalStorage = localStorage.getItem("course") ?? "";
      payload.course = courseFromLocalStorage === "" ? null : courseFromLocalStorage;
      // -----------------------------------------------------------

      const resp = await axios.put(`${API_BASE_URL}/api/auth/edit-faculty/${id}`, payload, { headers });

      const updatedUser = resp.data?.data ?? resp.data;

      if (updatedUser) {
        const safeUser = { ...updatedUser };
        if (safeUser.password) delete safeUser.password;
        setFacultyList((prev) => prev.map((f) => (f._id === id ? { ...f, ...safeUser } : f)));
        setSelectedFacultyInfo(safeUser);
      } else {
        setFacultyList((prev) => prev.map((f) => (f._id === id ? { ...f, ...form } : f)));
        setSelectedFacultyInfo(form);
      }

      Swal.fire({
  icon: "success",
  title: "Saved",
  text: "Faculty information updated.",
  timer: 1500,              // auto close after 1.5s
  timerProgressBar: true,   // optional progress bar
  showConfirmButton: false, // hide the OK button
});

      closeViewDialog();
    } catch (err: any) {
      console.error("Failed to save faculty:", err);

      if (err?.response?.status === 409 && err.response.data?.message) {
        Swal.fire({ icon: "error", title: "Conflict", text: err.response.data.message });
        setSaveLoading(false);
        return;
      }

      const serverErrors = err?.response?.data?.errors;
      if (serverErrors && typeof serverErrors === "object") {
        const mapped: Record<string, string> = {};
        for (const k of Object.keys(serverErrors)) mapped[k] = String(serverErrors[k]);
        setFieldErrors(mapped);
        setSaveLoading(false);
        return;
      }

      const serverMessage = err?.response?.data?.message ?? err?.message ?? "Failed to save changes";
      Swal.fire({ icon: "error", title: "Error", text: serverMessage });
    } finally {
      setSaveLoading(false);
    }
  };

  // keep the status update flow (used from menu) — it still updates faculty.status in table if needed
  const handleUpdateStatusFromMenu = async () => {
    if (!selectedFacultyInfo) {
      closeThreeDotMenu();
      return;
    }

    const inputOptions: Record<string, string> = {
      active: "Active",
      inactive: "Inactive",
      forverification: "For Verification",
      permanent: "Permanent",
    };

    const { value: status } = await Swal.fire({
      title: "Update account status",
      input: "select",
      inputOptions,
      inputPlaceholder: "Select status",
      showCancelButton: true,
    });

    if (!status) {
      closeThreeDotMenu();
      return;
    }

    const id = selectedFacultyInfo._id;
    if (!id) {
      Swal.fire({ icon: "error", title: "Error", text: "Selected faculty has no id." });
      closeThreeDotMenu();
      return;
    }

    setUpdatingStatus(true);

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";
      const headers: any = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const resp = await axios.put(`${API_BASE_URL}/api/auth/faculty/${id}`, { status }, { headers });

      const updatedUser = resp.data?.data ?? resp.data;

      if (updatedUser) {
        const safeUser = { ...updatedUser };
        if (safeUser.password) delete safeUser.password;
        setFacultyList((prev) => prev.map((f) => (f._id === id ? { ...f, ...safeUser } : f)));
        setSelectedFacultyInfo(safeUser);
      } else {
        setFacultyList((prev) => prev.map((f) => (f._id === id ? { ...f, status } : f)));
      }

      Swal.fire({
        icon: "success",
        title: "Updated",
        text: `Status updated to "${inputOptions[status]}"`,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err: any) {
      console.error("Failed to update status:", err);
      const serverMessage = err?.response?.data?.message ?? err?.message ?? "Failed to update status";
      Swal.fire({
        icon: "error",
        title: "Error",
        text: serverMessage,
      });
    } finally {
      setUpdatingStatus(false);
      closeThreeDotMenu();
    }
  };
  // -----------------------------------------------------------------------

  // Editable modal: LOCAL form state so typing doesn't update parent and won't blink
  const ViewFacultyModal: React.FC<{
    open: boolean;
    onClose: () => void;
    faculty: any;
    onSave: (form: any) => Promise<void>;
  }> = ({ open, onClose, faculty, onSave }) => {
    const [form, setForm] = useState<any>(null);

    // initialize the local form once when modal opens or faculty changes
    useEffect(() => {
      if (open) {
        // deep copy to avoid accidental shared references
        const copy = faculty ? JSON.parse(JSON.stringify(faculty)) : null;
        // ensure status is present (fallback to forverification)
        if (copy && !copy.status) copy.status = "forverification";

        // --- NEW: ensure the local form's course uses the course from localStorage ---
        const courseFromLocalStorage = localStorage.getItem("course") ?? "";
        if (copy) {
          copy.course = courseFromLocalStorage === "" ? null : courseFromLocalStorage;
        }
        // ---------------------------------------------------------------

        setForm(copy);
      }
    }, [open, faculty]);

    if (!open || !form) return null;

    const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;
      setForm((prev: any) => ({ ...prev, [name]: value }));
      // clear field error for this field
      setFieldErrors((prev) => {
        if (!prev[name]) return prev;
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    };

    const handleLocalSelectChange = (e: any) => {
      const { name, value } = e.target;
      setForm((prev: any) => ({ ...prev, [name]: value }));
      setFieldErrors((prev) => {
        if (!prev[name]) return prev;
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    };

    return (
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
        <DialogTitle>Edit Faculty</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={3} sx={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                <Avatar src={form.profilePhotoUrl || undefined} sx={{ width: 96, height: 96, fontSize: 32 }}>
                  {!form.profilePhotoUrl && form.first_name?.charAt(0)}
                </Avatar>
              </Grid>

              <Grid item xs={12} sm={9}>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Last Name"
                      name="last_name"
                      value={form.last_name || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.last_name)}
                      helperText={fieldErrors.last_name}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="First Name"
                      name="first_name"
                      value={form.first_name || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.first_name)}
                      helperText={fieldErrors.first_name}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Middle Name"
                      name="middle_name"
                      value={form.middle_name || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.middle_name)}
                      helperText={fieldErrors.middle_name}
                    />
                  </Grid>

                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Username"
                      name="username"
                      value={form.username || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.username)}
                      helperText={fieldErrors.username}
                    />
                  </Grid>
                  <Grid item xs={12} sm={8}>
                    <TextField
                      label="Email"
                      name="email"
                      value={form.email || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.email)}
                      helperText={fieldErrors.email}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Highest Educational Attainment"
                      name="highestEducationalAttainment"
                      value={form.highestEducationalAttainment || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.highestEducationalAttainment)}
                      helperText={fieldErrors.highestEducationalAttainment}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Academic Rank"
                      name="academicRank"
                      value={form.academicRank || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.academicRank)}
                      helperText={fieldErrors.academicRank}
                    />
                  </Grid>

                  <Grid item xs={12} sm={12}>
                    <TextField
                      label="Status of Appointment"
                      name="statusOfAppointment"
                      value={form.statusOfAppointment || ""}
                      fullWidth
                      size="small"
                      onChange={handleLocalChange}
                      error={Boolean(fieldErrors.statusOfAppointment)}
                      helperText={fieldErrors.statusOfAppointment}
                    />
                  </Grid>

                  {/* NEW: Status select */}
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth size="small" error={Boolean(fieldErrors.status)}>
                      <InputLabel id="edit-status-label">Account Status</InputLabel>
                      <Select
                        labelId="edit-status-label"
                        label="Account Status"
                        name="status"
                        value={form.status || "forverification"}
                        onChange={handleLocalSelectChange}
                      >
                        <MenuItem value="forverification">For Verification</MenuItem>
                        <MenuItem value="active">Active</MenuItem>
                        <MenuItem value="inactive">Inactive</MenuItem>
                        <MenuItem value="permanent">Permanent</MenuItem>
                      </Select>
                      {fieldErrors.status && <Box sx={{ color: "error.main", fontSize: "0.75rem", mt: 0.5 }}>{fieldErrors.status}</Box>}
                    </FormControl>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saveLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => onSave(form)}
            disabled={saveLoading}
          >
            {saveLoading ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  return (
    <AdminMain>
      <Box display="flex" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box mb={3}>
          <Typography variant="h4" fontWeight="bold" color="#333" gutterBottom>
            Faculty Information {CourseName && `- ${CourseName.toUpperCase()}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            This section provides detailed information about the faculty members{" "}
            {CourseName && `under the ${CourseName.toUpperCase()} program`}.
          </Typography>
        </Box>

        <TextField
          variant="outlined"
          placeholder="Search faculty..."
          size="small"
          sx={{ mx: 2, width: "250px" }}
          onChange={handleSearch}
        />

        <IconButton color="primary" onClick={handleOpenModal}>
          <AddIcon />
        </IconButton>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TableContainer
            component={Paper}
            sx={{
              width: "100%",
              borderRadius: 2,
              boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.05)",
            }}
          >
            <Table>
              <TableHead sx={{ backgroundColor: "#F5F3F4" }}>
                <TableRow>
                  <TableCell>
                    <strong>Profile</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Full Name</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Email</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Username</strong>
                  </TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center" sx={{ cursor: "pointer" }} onClick={handleStatusClick}>
                      <strong>Status of Account</strong>
                      <IconButton size="small" sx={{ ml: 0.5, p: 0 }}>
                        <ArrowDropDownIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    <Menu anchorEl={statusAnchorEl} open={statusMenuOpen} onClose={handleStatusClose}>
                      <MenuItem onClick={() => handleStatusSelect("all")}>All</MenuItem>
                      <MenuItem onClick={() => handleStatusSelect("active")}>Active</MenuItem>
                      <MenuItem onClick={() => handleStatusSelect("inactive")}>Inactive</MenuItem>
                      <MenuItem onClick={() => handleStatusSelect("forverification")}>For Verification</MenuItem>
                    </Menu>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedFacultyList.map((faculty) => (
                  <TableRow
                    key={faculty._id}
                    onClick={() => handleOpenInfoModal(faculty)}
                    sx={{
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "#FAFAFA" },
                    }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Avatar
                          src={faculty.profilePhotoUrl || undefined}
                          sx={{
                            bgcolor: faculty.profilePhotoUrl ? "transparent" : "#90caf9",
                            width: 32,
                            height: 32,
                            mr: 1,
                          }}
                        >
                          {!faculty.profilePhotoUrl && faculty.first_name?.charAt(0)}
                        </Avatar>
                      </Box>
                    </TableCell>

                    <TableCell>{`${faculty.last_name}, ${faculty.first_name} ${faculty.middle_name ? faculty.middle_name.charAt(0) + "." : ""}`}</TableCell>

                    <TableCell>{faculty.email}</TableCell>
                    <TableCell>{faculty.username}</TableCell>

                    <TableCell>
                      <Chip
                        label={
                          faculty.status === "forverification"
                            ? "For Verification"
                            : faculty.status?.charAt(0).toUpperCase() + faculty.status?.slice(1)
                        }
                        color={faculty.status === "active" ? "success" : faculty.status === "inactive" ? "default" : "warning"}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>

                    {/* MoreHoriz Menu Icon */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <IconButton color="primary" onClick={(e) => openThreeDotMenu(e, faculty)} aria-label={`menu-${faculty._id}`}>
                        <MoreHorizIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {/* The three-dot menu that now shows Edit + Update Status */}
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={closeThreeDotMenu}
                PaperProps={{
                  sx: {
                    borderRadius: 2,
                    boxShadow: "0px 4px 20px rgba(0,0,0,0.1)",
                    minWidth: 200,
                  },
                }}
              >
                <MenuItem
                  onClick={() => {
                    handleEditFromMenu();
                  }}
                  disabled={updatingStatus}
                  sx={{
                    color: "inherit",
                    fontWeight: 500,
                    "&:hover": {
                      backgroundColor: "#f5f5f5",
                    },
                  }}
                >
                  <EditIcon fontSize="small" sx={{ mr: 1 }} />
                  Edit
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    handleUpdateStatusFromMenu();
                  }}
                  disabled={updatingStatus}
                  sx={{
                    color: "inherit",
                    fontWeight: 500,
                    "&:hover": {
                      backgroundColor: "#f5f5f5",
                    },
                  }}
                >
                  <AutorenewIcon fontSize="small" sx={{ mr: 1 }} />
                  {updatingStatus ? "Updating..." : "Update Status"}
                </MenuItem>
              </Menu>
            </Table>
            {/* Table Pagination */}
            <TablePagination
              component="div"
              count={filteredFacultyList.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
            />
            <InfoModal open={openInfoModal} onClose={handleCloseInfoModal} faculty={selectedFacultyInfo} />
          </TableContainer>
        </Grid>
      </Grid>

      {/* Add Faculty Modal (unchanged) */}
      <AddFacultyModal
        open={openModal}
        onClose={handleCloseModal}
        onAdd={handleAddAccount}
        newFaculty={newFaculty}
        setNewFaculty={setNewFaculty}
        handleInputChange={handleInputChange}
        handleRoleChange={handleRoleChange}
        showPassword={showPassword}
        togglePasswordVisibility={togglePasswordVisibility}
      />

      {/* Editable View/Edit faculty modal */}
      <ViewFacultyModal open={viewDialogOpen} onClose={closeViewDialog} faculty={selectedFacultyInfo} onSave={handleSaveEditWithForm} />
    </AdminMain>
  );
};

export default FacultyInfo;
