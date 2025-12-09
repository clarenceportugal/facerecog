import React, { useEffect, useState } from "react";
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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  SelectChangeEvent,
  Menu,
  Autocomplete,
  TablePagination,
  CircularProgress,
  Chip
} from "@mui/material";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import SearchIcon from "@mui/icons-material/Search";
import Swal from "sweetalert2";
import { useFacultyContext } from "../../context/FacultyContext";
import BlockIcon from "@mui/icons-material/Block";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import axios from "axios";
import DeanMain from "./DeanMain";

interface ProgramChair {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  status: string;
  course: string;
  role: string;
  college: {
    code: string;
  };
}

interface Course {
  _id: string;
  name: string;
  code: string;
  college: string;
}

const ProgramchairInfo: React.FC = () => {
  const collegeCode = localStorage.getItem("college") ?? "";
  const [loading, setLoading] = useState(false);
  const [programChairs, setProgramChairs] = useState<ProgramChair[]>([]);
  const [filteredChairs, setFilteredChairs] = useState<ProgramChair[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { facultyList, setFacultyList } = useFacultyContext();
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [newFaculty, setNewFaculty] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    username: "",
    email: "",
    password: "",
    role: "",
    college: "",
    course: collegeCode,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [roleAnchorEl, setRoleAnchorEl] = useState<null | HTMLElement>(null);
  const [courseAnchorEl, setCourseAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const [statusAnchorEl, setStatusAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const roleMenuOpen = Boolean(roleAnchorEl);
  const courseMenuOpen = Boolean(courseAnchorEl);
  const statusMenuOpen = Boolean(statusAnchorEl);
  const [courses, setCourses] = useState<Course[]>([]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [actionAnchorEl, setActionAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const [selectedChairId, setSelectedChairId] = useState<string | null>(null);

  const handleActionMenuOpen = (
    event: React.MouseEvent<HTMLButtonElement>,
    chairId: string
  ) => {
    setActionAnchorEl(event.currentTarget);
    setSelectedChairId(chairId);
  };

  const handleActionMenuClose = () => {
    setActionAnchorEl(null);
    setSelectedChairId(null);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  useEffect(() => {
    const fetchCourses = async () => {
      const collegeCode = localStorage.getItem("college") ?? "";

      if (!collegeCode) {
        console.error("No college code found in localStorage.");
        return;
      }

      try {
        const response = await axios.post(
          "https://eduvision-dura.onrender.com/api/auth/college-courses",
          { collegeCode }
        );
        setCourses(response.data.courses); // <--- here
      } catch (err: any) {
        console.error(
          "Failed to fetch courses:",
          err.response?.data?.message || err.message
        );
      }
    };

    fetchCourses();
  }, []);

  const fetchProgramChairs = async () => {
    try {
      setLoading(true);
      const res = await axios.get(
        `https://eduvision-dura.onrender.com/api/auth/programchairs`,
        {
          params: { collegeCode },
        }
      );
      setProgramChairs(res.data);
      setFilteredChairs(res.data);
      setFacultyList(res.data); // Keep context in sync, if needed
    } catch (error) {
      console.error("Error fetching program chairpersons:", error);
    } finally {
      setLoading(false); // stop loading
    }
  };

  useEffect(() => {
    fetchProgramChairs();
  }, [collegeCode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setSearchQuery(value);

    const filtered = programChairs.filter((chair) => {
      return (
        chair.first_name.toLowerCase().includes(value) ||
        (chair.middle_name?.toLowerCase().includes(value) ?? false) ||
        chair.last_name.toLowerCase().includes(value) ||
        chair.email.toLowerCase().includes(value) ||
        chair.username.toLowerCase().includes(value)
      );
    });

    setFilteredChairs(filtered);
  };

  const handleRoleClick = (event: React.MouseEvent<HTMLElement>) => {
    setRoleAnchorEl(event.currentTarget);
  };

  const handleCourseClick = (event: React.MouseEvent<HTMLElement>) => {
    setCourseAnchorEl(event.currentTarget);
  };

  const handleStatusClick = (event: React.MouseEvent<HTMLElement>) => {
    setStatusAnchorEl(event.currentTarget);
  };

  const handleRoleClose = () => {
    setRoleAnchorEl(null);
  };

  const handleCourseClose = () => {
    setCourseAnchorEl(null);
  };

  const handleStatusClose = () => {
    setStatusAnchorEl(null);
  };

  const handleRoleSelect = (role: string) => {
    if (role === "all") {
      setFilteredChairs(programChairs);
    } else {
      const filtered = programChairs.filter(
        (chair) => chair.role.toLowerCase() === role.toLowerCase()
      );
      setFilteredChairs(filtered);
    }
    handleRoleClose();
  };

  const handleCourseSelect = (courseCode: string) => {
    if (courseCode === "all") {
      setFilteredChairs(programChairs);
    } else {
      const filtered = programChairs.filter(
        (chair) =>
          chair.course &&
          chair.course.toLowerCase() === courseCode.toLowerCase()
      );
      setFilteredChairs(filtered);
    }
    handleCourseClose();
  };

  const handleStatusSelect = (status: string) => {
    if (status === "all") {
      setFilteredChairs(programChairs);
    } else {
      const filtered = programChairs.filter(
        (chair) => chair.status.toLowerCase() === status.toLowerCase()
      );
      setFilteredChairs(filtered);
    }
    handleStatusClose(); // make sure this closes the menu
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
      course: "",
      college: collegeCode,
    });
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setNewFaculty({
      last_name: "",
      first_name: "",
      middle_name: "",
      username: "",
      email: "",
      password: "",
      role: "instructor",
      course: "",
      college: "",
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewFaculty((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (event: SelectChangeEvent<string>) => {
    const selectedRole = event.target.value;
    setNewFaculty((prev) => ({
      ...prev,
      role: selectedRole,
      course: "", // reset course on role change
    }));
  };

  const handleAddAccount = async () => {
    if (
      !newFaculty.last_name.trim() ||
      !newFaculty.first_name.trim() ||
      !newFaculty.email.trim() ||
      !newFaculty.password.trim()
    ) {
      Swal.fire({
        icon: "warning",
        title: "Missing Fields",
        text: "Please fill out all required fields.",
      });
      return;
    }

    try {
      const res = await axios.post(
        "https://eduvision-dura.onrender.com/api/auth/faculty",
        newFaculty
      );
      setFacultyList([...facultyList, res.data]);
      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Faculty account added successfully!",
      });
      handleCloseModal();
      fetchProgramChairs();
    } catch (error: any) {
      console.error("Error adding faculty account:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.response?.data?.message || "Failed to add faculty account.",
      });
    }
  };

  const handleDeleteAccount = async (id: string) => {
    const confirmation = await Swal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (confirmation.isConfirmed) {
      try {
        await axios.delete(
          `https://eduvision-dura.onrender.com/api/auth/faculty/${id}`
        );
        setFacultyList(facultyList.filter((faculty) => faculty._id !== id));
        if (selectedFaculty === id) {
          setSelectedFaculty(null);
        }
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: "The faculty account has been deleted successfully.",
        });
        fetchProgramChairs();
      } catch (error) {
        console.error("Error deleting account:", error);
        Swal.fire({
          icon: "error",
          title: "Oops...",
          text: "Something went wrong! Unable to delete the account.",
        });
      }
    }
  };

  const generateUsername = (firstName: string, lastName: string, middleName?: string) => {
    // Different construction: first initial + last name (up to 5 chars) + first name (up to 3 chars)
    // Example: "John" "Abejero" -> "JABEJJO" or "JABEJOHN"
    const firstInitial = firstName.charAt(0).toUpperCase();
    const lastPart = lastName.substring(0, Math.min(5, lastName.length)).toUpperCase();
    const firstPart = firstName.substring(0, Math.min(3, firstName.length)).toUpperCase();
    const middle = middleName ? middleName.charAt(0).toUpperCase() : '';
    
    if (middle) {
      // First initial + last (5 chars) + middle initial + first (3 chars)
      return firstInitial + lastPart + middle + firstPart;
    }
    // First initial + last (5 chars) + first (3 chars)
    return firstInitial + lastPart + firstPart;
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (newFaculty.first_name && newFaculty.last_name) {
        const username = generateUsername(
          newFaculty.first_name,
          newFaculty.last_name
        );
        setNewFaculty((prev) => ({ ...prev, username }));
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [newFaculty.first_name, newFaculty.last_name]);

  return (
    <DeanMain>
      <Box display="flex" flexDirection="column" gap={3}>
        {/* Header Section */}
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            p: 3,
            backgroundColor: "#fff",
            borderRadius: 3,
            boxShadow: "0px 2px 8px rgba(0, 0, 0, 0.08)",
          }}
        >
          <Box>
            <Typography variant="h4" fontWeight={700} color="#1a1a1a" gutterBottom>
              {collegeCode
                ? `${collegeCode} Staff Information`
                : "Faculty Information"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Manage and view detailed information about staff members
              {collegeCode && ` in the ${collegeCode} college`}
            </Typography>
          </Box>

          <Box display="flex" alignItems="center" gap={2}>
            <TextField
              variant="outlined"
              placeholder="Search by name, email, or username..."
              size="small"
              value={searchQuery}
              onChange={handleSearch}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{
                width: "320px",
                backgroundColor: "#f8f9fa",
                "& .MuiOutlinedInput-root": {
                  borderRadius: 2,
                },
              }}
            />

            <IconButton
              color="primary"
              onClick={handleOpenModal}
              sx={{
                backgroundColor: "primary.main",
                color: "#fff",
                "&:hover": {
                  backgroundColor: "primary.dark",
                },
                borderRadius: 2,
                p: 1.5,
                boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)",
              }}
            >
              <AddIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Table Section */}
        <TableContainer
          component={Paper}
          sx={{
            width: "100%",
            borderRadius: 3,
            boxShadow: "0px 4px 16px rgba(0, 0, 0, 0.1)",
            overflow: "hidden",
          }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#f1f3f4" }}>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                  Full Name
                </TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                  Email
                </TableCell>
                <TableCell>
                  <Box
                    display="flex"
                    alignItems="center"
                    sx={{ cursor: "pointer", fontWeight: 700, fontSize: "0.875rem", color: "#333" }}
                    onClick={handleRoleClick}
                  >
                    Position
                    <IconButton size="small" sx={{ ml: 0.5, p: 0 }}>
                      <ArrowDropDownIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Menu
                    anchorEl={roleAnchorEl}
                    open={roleMenuOpen}
                    onClose={handleRoleClose}
                  >
                    <MenuItem onClick={() => handleRoleSelect("all")}>
                      All
                    </MenuItem>
                    <MenuItem
                      onClick={() =>
                        handleRoleSelect("programchairperson")
                      }
                    >
                      Program Chairperson
                    </MenuItem>
                    <MenuItem
                      onClick={() => handleRoleSelect("instructor")}
                    >
                      Instructor
                    </MenuItem>
                  </Menu>
                </TableCell>

                <TableCell>
                  <Box
                    display="flex"
                    alignItems="center"
                    sx={{ cursor: "pointer", fontWeight: 700, fontSize: "0.875rem", color: "#333" }}
                    onClick={handleCourseClick}
                  >
                    Program
                    <IconButton size="small" sx={{ ml: 0.5, p: 0 }}>
                      <ArrowDropDownIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Menu
                    anchorEl={courseAnchorEl}
                    open={courseMenuOpen}
                    onClose={handleCourseClose}
                  >
                    <MenuItem onClick={() => handleCourseSelect("all")}>
                      All
                    </MenuItem>
                    {courses.map((course) => (
                      <MenuItem
                        key={course._id}
                        onClick={() => handleCourseSelect(course.code)}
                      >
                        {course.code}
                      </MenuItem>
                    ))}
                  </Menu>
                </TableCell>

                <TableCell>
                  <Box
                    display="flex"
                    alignItems="center"
                    sx={{ cursor: "pointer", fontWeight: 700, fontSize: "0.875rem", color: "#333" }}
                    onClick={handleStatusClick}
                  >
                    Status
                    <IconButton size="small" sx={{ ml: 0.5, p: 0 }}>
                      <ArrowDropDownIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Menu
                    anchorEl={statusAnchorEl}
                    open={statusMenuOpen}
                    onClose={handleStatusClose}
                  >
                    <MenuItem onClick={() => handleStatusSelect("all")}>
                      All
                    </MenuItem>
                    <MenuItem
                      onClick={() => handleStatusSelect("active")}
                    >
                      Active
                    </MenuItem>
                    <MenuItem
                      onClick={() => handleStatusSelect("inactive")}
                    >
                      Inactive
                    </MenuItem>
                    <MenuItem
                      onClick={() =>
                        handleStatusSelect("forverification")
                      }
                    >
                      For Verification
                    </MenuItem>
                  </Menu>
                </TableCell>

                <TableCell sx={{ fontWeight: 700, fontSize: "0.875rem", color: "#333" }}>
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={30} />
                    <Typography mt={2} variant="body2" color="text.secondary">
                      Loading faculty data...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredChairs.length > 0 ? (
                filteredChairs
                  .slice(
                    page * rowsPerPage,
                    page * rowsPerPage + rowsPerPage
                  )
                  .map((chair, index) => (
                    <TableRow
                      key={chair._id}
                      sx={{
                        backgroundColor: index % 2 === 0 ? "#fafafa" : "white",
                        transition: "background-color 0.2s ease",
                        "&:hover": {
                          backgroundColor: "#f0f4ff",
                          transform: "scale(1.001)",
                        },
                      }}
                    >
                      <TableCell sx={{ py: 1.5 }}>
                        {`${chair.last_name}, ${chair.first_name} ${chair.middle_name ?? ""}`}
                      </TableCell>
                      <TableCell sx={{ py: 1.5 }}>{chair.email}</TableCell>
                      <TableCell sx={{ py: 1.5 }}>
                        {chair.role === "programchairperson"
                          ? "Program Chairperson"
                          : chair.role.charAt(0).toUpperCase() +
                            chair.role.slice(1)}
                      </TableCell>
                      <TableCell sx={{ py: 1.5 }}>{chair.course}</TableCell>
                      <TableCell sx={{ py: 1.5 }}>
                        {chair.status === "forverification" ? (
                          <Chip
                            label="For Verification"
                            size="small"
                            sx={{
                              bgcolor: "#fff3cd",
                              color: "#856404",
                              fontWeight: 500,
                              borderRadius: "8px",
                            }}
                          />
                        ) : chair.status === "active" ? (
                          <Chip
                            label="Active"
                            size="small"
                            sx={{
                              bgcolor: "#d4edda",
                              color: "#155724",
                              fontWeight: 500,
                              borderRadius: "8px",
                            }}
                          />
                        ) : chair.status === "inactive" ? (
                          <Chip
                            label="Inactive"
                            size="small"
                            sx={{
                              bgcolor: "#f8d7da",
                              color: "#721c24",
                              fontWeight: 500,
                              borderRadius: "8px",
                            }}
                          />
                        ) : (
                          <Chip
                            label={chair.status.charAt(0).toUpperCase() + chair.status.slice(1)}
                            size="small"
                            sx={{
                              bgcolor: "#e2e3e5",
                              color: "#383d41",
                              fontWeight: 500,
                              borderRadius: "8px",
                            }}
                          />
                        )}
                      </TableCell>
                      <TableCell sx={{ py: 1.5 }}>
                        <IconButton
                          onClick={(e) =>
                            handleActionMenuOpen(e, chair._id)
                          }
                          size="small"
                          sx={{
                            "&:hover": {
                              backgroundColor: "#f0f4ff",
                            },
                          }}
                        >
                          <MoreHorizIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        align="center"
                        sx={{ py: 6, fontStyle: "italic", color: "text.secondary" }}
                      >
                        No faculty data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <TablePagination
                component="div"
                count={filteredChairs.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 25]}
                sx={{
                  borderTop: "1px solid #e0e0e0",
                  backgroundColor: "#fafafa",
                  px: 2,
                }}
              />
            </TableContainer>

            {/* Action menu */}
            <Menu
              anchorEl={actionAnchorEl}
              open={Boolean(actionAnchorEl)}
              onClose={handleActionMenuClose}
            >
              <MenuItem
                onClick={() => {
                  console.log("Block user:", selectedChairId);
                  handleActionMenuClose();
                }}
              >
                <BlockIcon fontSize="small" sx={{ mr: 1 }} /> Block
              </MenuItem>
              <MenuItem
                onClick={() => {
                  if (selectedChairId) handleDeleteAccount(selectedChairId);
                  handleActionMenuClose();
                }}
              >
                <DeleteIcon fontSize="small" sx={{ color: "red", mr: 1 }} />{" "}
                Delete
              </MenuItem>
            </Menu>
      </Box>

      {/* make sure you have: import Autocomplete from '@mui/material/Autocomplete' at the top of the file */}

<Dialog open={openModal} onClose={handleCloseModal}>
  <DialogTitle>Add Faculty Account</DialogTitle>
  <DialogContent>
    <TextField
      fullWidth
      label="Last Name"
      name="last_name"
      value={newFaculty.last_name}
      onChange={handleInputChange}
      margin="dense"
    />
    <TextField
      fullWidth
      label="First Name"
      name="first_name"
      value={newFaculty.first_name}
      onChange={handleInputChange}
      margin="dense"
    />
    <TextField
      fullWidth
      label="Middle Name"
      name="middle_name"
      value={newFaculty.middle_name}
      onChange={handleInputChange}
      margin="dense"
    />
    <TextField
      label="Username"
      name="username"
      value={newFaculty.username}
      fullWidth
      margin="normal"
      InputProps={{
        readOnly: true,
      }}
    />

    <TextField
      fullWidth
      label="Email"
      name="email"
      value={newFaculty.email}
      onChange={handleInputChange}
      margin="dense"
    />
    <TextField
      fullWidth
      label="Password"
      name="password"
      type={showPassword ? "text" : "password"}
      value={newFaculty.password}
      onChange={handleInputChange}
      margin="dense"
      InputProps={{
        readOnly: true,
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={togglePasswordVisibility} edge="end">
              {showPassword ? <VisibilityOff /> : <Visibility />}
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
    <FormControl fullWidth margin="dense">
      <InputLabel>Role</InputLabel>
      <Select
        value={newFaculty.role}
        onChange={handleRoleChange}
        label="Role"
        name="role"
      >
        <MenuItem value="instructor">Instructor</MenuItem>
        <MenuItem value="programchairperson">
          Program Chairperson
        </MenuItem>
        {/* Add more roles if needed */}
      </Select>
    </FormControl>

    {/* SINGLE-LINE AUTOCOMPLETE — options & value are uppercased */}
    <Autocomplete
      options={courses.map((course) => (course?.code ?? "").toUpperCase())}
      getOptionLabel={(option) => option}
      value={newFaculty.course ? String(newFaculty.course).toUpperCase() : null}
      onChange={(_, newValue) => {
        setNewFaculty((prev) => ({ ...prev, course: newValue ? String(newValue).toUpperCase() : "" }));
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Select Course Code"
          variant="outlined"
          size="small"
          fullWidth
          margin="dense"
          InputProps={{
            ...params.InputProps,
            // ensure the input text is uppercase visually (also helps if user types)
            inputProps: {
              ...params.inputProps,
              style: { textTransform: "uppercase" },
            },
          }}
        />
      )}
      // keep it single-line and full width; no fixed width
      freeSolo={false}
      disableClearable={false}
      sx={{ mt: 1 }}
    />
  </DialogContent>
  <DialogActions>
    <Button onClick={handleCloseModal}>Cancel</Button>
    <Button
      onClick={handleAddAccount}
      variant="contained"
      color="primary"
    >
      Add
    </Button>
  </DialogActions>
</Dialog>

    </DeanMain>
  );
};

export default ProgramchairInfo;
