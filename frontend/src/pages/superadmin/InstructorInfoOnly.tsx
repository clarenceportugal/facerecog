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
  TablePagination,
  CircularProgress,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import axios from "axios";
import SuperadminMain from "./SuperadminMain";

interface College {
  _id: string;
  code: string;
  name: string;
}

interface Instructor {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  role: string;
  college?: College;
  course: string;
  status: string;
}

const ProgramChairInfoOnly: React.FC = () => {
  const [instructorInfo, setInstructorInfo] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInstructorInfo = async () => {
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/instructorinfo-only"
        );
        setInstructorInfo(response.data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching instructor info:", error);
        setError("Failed to fetch instructor info");
        setLoading(false);
      }
    };

    fetchInstructorInfo();
  }, []);

  const filteredInstructorInfo = instructorInfo;

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedInstructors = filteredInstructorInfo.slice(
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
          <Typography variant="h4" fontWeight="bold" color="#333" gutterBottom>
            List of Instructor/s
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            This section contains a list of all current instructors across
            departments and their respective information.
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
            sx={{ whiteSpace: "nowrap" }}
          >
            Add Instructor
          </Button>
        </Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          {loading ? (
            <Box display="flex" justifyContent="center" py={5}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error" align="center">
              {error}
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              sx={{ borderRadius: 3, boxShadow: 2, overflow: "hidden" }}
            >
              <Table>
                <TableHead sx={{ backgroundColor: "#f5f5f5" }}>
                  <TableRow>
                    {[
                      "Full Name",
                      "Username",
                      "Email",
                      "College",
                      "Course",
                      "Status",
                      "Action",
                    ].map((label, idx) => (
                      <TableCell key={idx}>
                        <strong>{label}</strong>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paginatedInstructors.map((instructor) => (
                    <TableRow key={instructor._id} hover>
                      <TableCell>
                        {`${instructor.last_name}, ${instructor.first_name} ${
                          instructor.middle_name
                            ? instructor.middle_name.charAt(0) + "."
                            : ""
                        }`}
                      </TableCell>
                      <TableCell>{instructor.username}</TableCell>
                      <TableCell>{instructor.email}</TableCell>
                      <TableCell>{instructor.college?.code || "N/A"}</TableCell>
                      <TableCell>
                        {instructor.course
                          ? instructor.course.toUpperCase()
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        {instructor.status === "forverification"
                          ? "For Verification"
                          : instructor.status.charAt(0).toUpperCase() +
                            instructor.status.slice(1)}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          color="primary"
                          onClick={() => console.log("Edit", instructor._id)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => console.log("Delete", instructor._id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedInstructors.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                        No instructor data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={filteredInstructorInfo.length}
                page={page}
                onPageChange={handleChangePage}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={handleChangeRowsPerPage}
                rowsPerPageOptions={[5, 10, 25]}
              />
            </TableContainer>
          )}
        </Grid>
      </Grid>
    </SuperadminMain>
  );
};

export default ProgramChairInfoOnly;
