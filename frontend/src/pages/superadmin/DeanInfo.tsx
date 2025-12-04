import React, { useEffect, useState } from "react";
import {
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Typography,
  Box,
  TextField,
  Button,
  MenuItem,
  Menu,
  SelectChangeEvent,
  TablePagination,
  CircularProgress,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import Swal from "sweetalert2";
import axios from "axios";
import SuperadminMain from "./SuperadminMain";
import AddDeanModal from "../../components/AddDeanModal";

interface College {
  _id: string;
  name: string;
  code: string;
}

interface Dean {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  ext_name?: string;
  username: string;
  email: string;
  role: string;
  college?: College;
  status: string;
}

const DeanInfo: React.FC = () => {
  const [deans, setDeans] = useState<Dean[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusAnchorEl, setStatusAnchorEl] = useState<null | HTMLElement>(
    null
  );
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const openStatusMenu = Boolean(statusAnchorEl);
  const [openModal, setOpenModal] = useState(false);
  const [colleges, setColleges] = useState<College[]>([]);
  const [collegeCourses, setCollegeCourses] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const random4Digit = (): string => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  const [newFaculty, setNewFaculty] = useState({
    last_name: "",
    first_name: "",
    middle_name: "",
    ext_name: "",
    college: "",
    username: "",
    email: "",
    password: random4Digit(),
    role: "dean",
    highestEducationalAttainment: "",
    academicRank: "",
    statusOfAppointment: "",
    numberOfPrep: 0,
    totalTeachingLoad: 0,
  });

  const [showPassword, setShowPassword] = useState(false);

  const handleStatusClick = (event: React.MouseEvent<HTMLElement>) => {
    setStatusAnchorEl(event.currentTarget);
  };

  const handleStatusClose = (status: string | null = null) => {
    if (status) {
      setSelectedStatus(status);
    }
    setStatusAnchorEl(null);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewFaculty((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRoleChange = (e: SelectChangeEvent<string>) => {
    setNewFaculty({ ...newFaculty, role: e.target.value });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
  };

  const handleAddAccount = async () => {
    try {
      const requiredFields = ["last_name", "first_name", "college", "email"];
      for (const field of requiredFields) {
        if (!newFaculty[field as keyof typeof newFaculty]) {
          Swal.fire({
            icon: "warning",
            title: "Missing Field",
            text: `Please fill out the ${field.replace("_", " ")} field.`,
          });
          return;
        }
      }

      const response = await axios.post(
        "https://eduvision-dura.onrender.com/api/superadmin/faculty",
        newFaculty
      );

      // Add new dean to the list
      setDeans((prev) => [...prev, response.data]);

      // Reset form and close modal
      setNewFaculty({
        last_name: "",
        first_name: "",
        middle_name: "",
        ext_name: "",
        college: "",
        username: "",
        email: "",
        password: "",
        role: "dean",
        highestEducationalAttainment: "",
        academicRank: "",
        statusOfAppointment: "",
        numberOfPrep: 0,
        totalTeachingLoad: 0,
      });
      setOpenModal(false);

      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Dean account successfully created and email sent!",
      });
    } catch (error: any) {
      console.error("Error adding dean account:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text:
          error.response?.data?.message ||
          "An error occurred while adding the dean.",
      });
    }
  };

  const handleDeleteDean = async (id: string) => {
    const result = await Swal.fire({
      title: "Are you sure?",
      text: "This action cannot be undone!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!",
    });

    if (result.isConfirmed) {
      try {
        await axios.delete(
          `https://eduvision-dura.onrender.com/api/superadmin/faculty/${id}`
        );

        setDeans((prev) => prev.filter((dean) => dean._id !== id));

        Swal.fire({
          icon: "success",
          title: "Deleted!",
          text: "Dean account has been deleted.",
        });
      } catch (error: any) {
        console.error("Error deleting dean:", error);
        Swal.fire({
          icon: "error",
          title: "Error",
          text:
            error.response?.data?.message ||
            "An error occurred while deleting the dean.",
        });
      }
    }
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

  useEffect(() => {
    const fetchColleges = async () => {
      setLoading(true);
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/all-colleges"
        );
        console.log("Fetched colleges:", response.data);
        setColleges(response.data);
      } catch (error) {
        console.error("Error fetching colleges:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchColleges();
  }, []);

  const fetchCoursesByCollege = async (collegeCode: string) => {
    try {
      const response = await axios.get(
        `https://eduvision-dura.onrender.com/api/superadmin/courses/by-college`,
        {
          params: { collegeCode },
        }
      );
      const courseCodes = response.data.map(
        (course: { code: string }) => course.code
      );
      setCollegeCourses(courseCodes);
      console.log("College courses:", collegeCourses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      setCollegeCourses([]);
    }
  };

  useEffect(() => {
    const fetchDeans = async () => {
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/dean"
        );
        setDeans(response.data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching deans:", error);
        setError("Failed to fetch deans");
        setLoading(false);
      }
    };

    fetchDeans();
  }, []);

  const filteredDeans = deans.filter((dean) => {
    return selectedStatus === "all" || dean.status === selectedStatus;
  });

  const handleChangePage = (
    _event: React.MouseEvent<HTMLButtonElement> | null,
    newPage: number
  ) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedDeans = filteredDeans.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <SuperadminMain>
      <Grid
        container
        alignItems="center"
        justifyContent="space-between"
        spacing={2}
        mb={3}
      >
        <Grid item xs={12} md={4}>
          <Typography variant="h4" fontWeight="bold">
            List of Dean/s
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            This section contains a list of all current deans across departments
            and their respective information.
          </Typography>
        </Grid>

        <Grid item xs={12} md={5} display="flex" justifyContent="center">
          <TextField
            size="small"
            placeholder="Search by name, username, or email..."
            variant="outlined"
            fullWidth
            onChange={(e) => {
              console.log(e.target.value);
            }}
            sx={{ maxWidth: 350 }}
          />
        </Grid>

        <Grid item xs={12} md={3} display="flex" justifyContent="flex-end">
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setOpenModal(true)}
            sx={{ whiteSpace: "nowrap" }}
          >
            Add Dean
          </Button>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TableContainer
            component={Paper}
            sx={{ borderRadius: 3, boxShadow: 3 }}
          >
            <Table>
              <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                <TableRow>
                  <TableCell>
                    <strong>Full Name</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Username</strong>
                  </TableCell>
                  <TableCell>
                    <strong>Email</strong>
                  </TableCell>
                  <TableCell>
                    <strong>College</strong>
                  </TableCell>
                  <TableCell>
                    <Box
                      display="flex"
                      alignItems="center"
                      sx={{ cursor: "pointer" }}
                      onClick={handleStatusClick}
                    >
                      <strong>Status of Account</strong>
                      <ArrowDropDownIcon />
                    </Box>
                    <Menu
                      anchorEl={statusAnchorEl}
                      open={openStatusMenu}
                      onClose={() => handleStatusClose()}
                      anchorOrigin={{
                        vertical: "bottom",
                        horizontal: "left",
                      }}
                      transformOrigin={{
                        vertical: "top",
                        horizontal: "left",
                      }}
                    >
                      <MenuItem onClick={() => handleStatusClose("all")}>
                        All
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleStatusClose("forverification")}
                      >
                        For Verification
                      </MenuItem>
                      <MenuItem onClick={() => handleStatusClose("active")}>
                        Active
                      </MenuItem>
                      <MenuItem onClick={() => handleStatusClose("inactive")}>
                        Inactive
                      </MenuItem>
                    </Menu>
                  </TableCell>
                  <TableCell>
                    <strong>Action</strong>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                      <Typography variant="body2" color="textSecondary" mt={2}>
                        Loading data...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      align="center"
                      sx={{ py: 4, color: "red" }}
                    >
                      {error}
                    </TableCell>
                  </TableRow>
                ) : paginatedDeans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      No dean records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedDeans.map((dean) => (
                    <TableRow key={dean._id} hover>
                      <TableCell>{`${dean.last_name}, ${dean.first_name} ${
                        dean.middle_name ? dean.middle_name.charAt(0) + "." : ""
                      } ${dean.ext_name || ""}`}</TableCell>
                      <TableCell>{dean.username}</TableCell>
                      <TableCell>{dean.email}</TableCell>
                      <TableCell>{dean.college?.name || "N/A"}</TableCell>
                      <TableCell>
                        {dean.status === "forverification"
                          ? "For Verification"
                          : dean.status.charAt(0).toUpperCase() +
                            dean.status.slice(1)}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          color="primary"
                          onClick={() => console.log("Edit", dean._id)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteDean(dean._id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {/* Pagination */}
            {!loading && !error && filteredDeans.length > 0 && (
              <TablePagination
                component="div"
                count={filteredDeans.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 25, 50]}
                sx={{ px: 2 }}
              />
            )}
          </TableContainer>
        </Grid>
      </Grid>
      <AddDeanModal
        openModal={openModal}
        handleCloseModal={handleCloseModal}
        handleAddAccount={handleAddAccount}
        handleInputChange={handleInputChange}
        handleRoleChange={handleRoleChange}
        togglePasswordVisibility={togglePasswordVisibility}
        showPassword={showPassword}
        newFaculty={newFaculty}
        setNewFaculty={setNewFaculty}
        colleges={colleges}
        fetchCoursesByCollege={fetchCoursesByCollege}
      />
    </SuperadminMain>
  );
};

export default DeanInfo;
