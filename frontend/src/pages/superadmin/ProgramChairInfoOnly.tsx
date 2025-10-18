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
  TablePagination,
  CircularProgress,
  TextField,
  Button,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import AddIcon from "@mui/icons-material/Add";
import axios from "axios";
import SuperadminMain from "./SuperadminMain";

interface College {
  _id: string;
  code: string;
  name: string;
}

interface ProgramChairperson {
  _id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  username: string;
  email: string;
  role: string;
  college?: College;
  status: string;
}

const ProgramChairInfoOnly: React.FC = () => {
  const [programchairinfo, setProgramChairInfo] = useState<
    ProgramChairperson[]
  >([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollegeCode, setSelectedCollegeCode] = useState<string>("all");
  const [colleges, setColleges] = useState<College[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);

  useEffect(() => {
    const fetchProgramChairInfo = async () => {
      try {
        const response = await axios.get(
          "https://eduvision-dura.onrender.com/api/superadmin/programchairinfo-only"
        );
        console.log("Fetched program chair info:", response.data);

        setProgramChairInfo(response.data);
        setLoading(false);

        const collegeMap = new Map<string, College>();
        response.data.forEach((pc: ProgramChairperson) => {
          if (pc.college) {
            collegeMap.set(pc.college._id, pc.college);
          }
        });

        // Add "All" option manually at the top
        const uniqueColleges = Array.from(collegeMap.values());
        setColleges([
          { _id: "all", code: "All", name: "All Colleges" },
          ...uniqueColleges,
        ]);
      } catch (error) {
        console.error("Error fetching program chair info:", error);
        setError("Failed to fetch program chair info");
        setLoading(false);
      }
    };

    fetchProgramChairInfo();
  }, []);

  const filteredProgramChairInfo =
    selectedCollegeCode === "all"
      ? programchairinfo
      : programchairinfo.filter(
          (pc) => pc.college?.code === selectedCollegeCode
        );

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0); // reset to first page
  };

  const paginatedData = filteredProgramChairInfo.slice(
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
            List of Program Chairperson/s
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            This section contains a list of all current program chairpersons
            across departments and their respective information.
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
            Add Program Chairperson
          </Button>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          {loading ? (
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              py={4}
            >
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error" align="center">
              {error}
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              sx={{
                borderRadius: 3,
                boxShadow: 3,
              }}
            >
              <Table>
                <TableHead sx={{ backgroundColor: "#f9f9f9" }}>
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
                      <Box position="relative" display="inline-block">
                        <Box
                          display="flex"
                          alignItems="center"
                          onClick={() => setDropdownOpen(!dropdownOpen)}
                          sx={{ cursor: "pointer" }}
                        >
                          <strong>College</strong>
                          <ArrowDropDownIcon sx={{ ml: 0.5 }} />
                        </Box>
                        {dropdownOpen && (
                          <Paper
                            elevation={3}
                            sx={{
                              position: "absolute",
                              zIndex: 10,
                              backgroundColor: "white",
                              mt: 1,
                              minWidth: 150,
                              maxHeight: 200,
                              overflowY: "auto",
                            }}
                          >
                            {colleges.map((college) => (
                              <Box
                                key={college._id}
                                px={2}
                                py={1}
                                sx={{
                                  cursor: "pointer",
                                  "&:hover": { backgroundColor: "#f0f0f0" },
                                }}
                                onClick={() => {
                                  setSelectedCollegeCode(
                                    college.code === "All"
                                      ? "all"
                                      : college.code
                                  );
                                  setDropdownOpen(false);
                                }}
                              >
                                {college.code}
                              </Box>
                            ))}
                          </Paper>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <strong>Status</strong>
                    </TableCell>
                    <TableCell>
                      <strong>Action</strong>
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {paginatedData.map((programchairinfo) => (
                    <TableRow key={programchairinfo._id} hover>
                      <TableCell>{`${programchairinfo.last_name}, ${
                        programchairinfo.first_name
                      } ${
                        programchairinfo.middle_name
                          ? programchairinfo.middle_name.charAt(0) + "."
                          : ""
                      }`}</TableCell>
                      <TableCell>{programchairinfo.username}</TableCell>
                      <TableCell>{programchairinfo.email}</TableCell>
                      <TableCell>
                        {programchairinfo.college?.name || "N/A"}
                      </TableCell>
                      <TableCell>
                        {programchairinfo?.status === "forverification"
                          ? "For Verification"
                          : programchairinfo?.status
                          ? programchairinfo.status.charAt(0).toUpperCase() +
                            programchairinfo.status.slice(1)
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <IconButton
                          color="primary"
                          onClick={() =>
                            console.log("Edit", programchairinfo._id)
                          }
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() =>
                            console.log("Delete", programchairinfo._id)
                          }
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}

                  {paginatedData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No program chairperson data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={filteredProgramChairInfo.length}
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
