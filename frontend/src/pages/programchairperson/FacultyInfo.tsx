import React, { useState, useEffect } from "react";
import axios from "axios";
import AdminMain from "./AdminMain";
import Swal from "sweetalert2";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
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
  SelectChangeEvent,
  Menu,
  Chip,
  TablePagination,
  Avatar,
} from "@mui/material";
import InfoModal from "../../components/InfoModal";
import BlockIcon from "@mui/icons-material/Block";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AddFacultyModal from "../../components/AddFacultyModal";

const FacultyInfo: React.FC = () => {
  const CourseName = localStorage.getItem("course") ?? "";
  const CollegeName = localStorage.getItem("college") ?? "";
  const { facultyList, setFacultyList } = useFacultyContext();
  const [selectedFaculty, setSelectedFaculty] = useState<string | null>(null);
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
  const [statusAnchorEl, setStatusAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

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

  const handleRoleChange = (event: SelectChangeEvent<string>) => {
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
      
      const res = await axios.post(
        `${API_BASE_URL}/api/auth/faculty`,
        newFaculty
      );
      
      console.log('[ADD FACULTY] Success:', res.data);
      setFacultyList([...facultyList, res.data]);
      
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
      
      Swal.fire({
        icon: "error",
        title: "Error",
        text: error.response?.data?.message || "Failed to add faculty account. Check console for details.",
        timer: 2000,
        timerProgressBar: true,
        willClose: () => {
          setOpenModal(true);
        },
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
        console.log('[DELETE FACULTY] Deleting faculty ID:', id);
        await axios.delete(`${API_BASE_URL}/api/auth/faculty/${id}`);
        setFacultyList(facultyList.filter((faculty) => faculty._id !== id));
        if (selectedFaculty === id) {
          setSelectedFaculty(null);
        }
        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: "The faculty account has been deleted successfully.",
        });
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

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value.toLowerCase());
  };

  const filteredFacultyList = facultyList.filter((faculty) => {
    const fullName = `${faculty.last_name}, ${faculty.first_name} ${
      faculty.middle_name || ""
    }`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery) ||
      faculty.username.toLowerCase().includes(searchQuery) ||
      faculty.email.toLowerCase().includes(searchQuery);

    const matchesStatus =
      selectedStatus === "all" ||
      faculty.status.toLowerCase() === selectedStatus.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  const [openInfoModal, setOpenInfoModal] = useState(false);
  const [selectedFacultyInfo, setSelectedFacultyInfo] = useState<any>(null);

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
        const username = generateUsername(
          newFaculty.first_name,
          newFaculty.last_name
        );
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

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedFacultyList = filteredFacultyList.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <AdminMain>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 2 }}
      >
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
                    <Box
                      display="flex"
                      alignItems="center"
                      sx={{ cursor: "pointer" }}
                      onClick={handleStatusClick}
                    >
                      <strong>Status of Account</strong>
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
                      <MenuItem onClick={() => handleStatusSelect("active")}>
                        Active
                      </MenuItem>
                      <MenuItem onClick={() => handleStatusSelect("inactive")}>
                        Inactive
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleStatusSelect("forverification")}
                      >
                        For Verification
                      </MenuItem>
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
                      backgroundColor:
                        selectedFaculty === faculty._id
                          ? "#E3F2FD"
                          : "transparent",
                      cursor: "pointer",
                      "&:hover": { backgroundColor: "#FAFAFA" },
                    }}
                  >
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        <Avatar
                          src={faculty.profilePhotoUrl || undefined}
                          sx={{
                            bgcolor: faculty.profilePhotoUrl
                              ? "transparent"
                              : "#90caf9",
                            width: 32,
                            height: 32,
                            mr: 1,
                          }}
                        >
                          {!faculty.profilePhotoUrl &&
                            faculty.first_name.charAt(0)}
                        </Avatar>
                      </Box>
                    </TableCell>

                    <TableCell>{`${faculty.last_name}, ${faculty.first_name} ${
                      faculty.middle_name
                        ? faculty.middle_name.charAt(0) + "."
                        : ""
                    }`}</TableCell>

                    <TableCell>{faculty.email}</TableCell>
                    <TableCell>{faculty.username}</TableCell>

                    <TableCell>
                      <Chip
                        label={
                          faculty.status === "forverification"
                            ? "For Verification"
                            : faculty.status.charAt(0).toUpperCase() +
                              faculty.status.slice(1)
                        }
                        color={
                          faculty.status === "active"
                            ? "success"
                            : faculty.status === "inactive"
                            ? "default"
                            : "warning"
                        }
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>

                    {/* MoreHoriz Menu Icon */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        color="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnchorEl(e.currentTarget);
                          setSelectedFacultyInfo(faculty);
                        }}
                      >
                        <MoreHorizIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                PaperProps={{
                  sx: {
                    borderRadius: 2,
                    boxShadow: "0px 4px 20px rgba(0,0,0,0.1)",
                    minWidth: 160,
                  },
                }}
              >
                <MenuItem
                  onClick={() => {
                    console.log("Block:", selectedFacultyInfo);
                    setAnchorEl(null);
                  }}
                  sx={{
                    color: "#ed6c02",
                    fontWeight: 500,
                    "&:hover": {
                      backgroundColor: "#fff3e0",
                    },
                  }}
                >
                  <BlockIcon
                    fontSize="small"
                    sx={{ mr: 1, color: "#ed6c02" }}
                  />
                  Block
                </MenuItem>

                <MenuItem
                  onClick={() => {
                    if (selectedFacultyInfo) {
                      handleDeleteAccount(selectedFacultyInfo._id);
                    }
                    setAnchorEl(null);
                  }}
                  sx={{
                    color: "#d32f2f", // error red
                    fontWeight: 500,
                    "&:hover": {
                      backgroundColor: "#ffebee", // light red
                    },
                  }}
                >
                  <DeleteIcon
                    fontSize="small"
                    sx={{ mr: 1, color: "#d32f2f" }}
                  />
                  Delete
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
            <InfoModal
              open={openInfoModal}
              onClose={handleCloseInfoModal}
              faculty={selectedFacultyInfo}
            />
          </TableContainer>
        </Grid>
      </Grid>

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
    </AdminMain>
  );
};

export default FacultyInfo;
