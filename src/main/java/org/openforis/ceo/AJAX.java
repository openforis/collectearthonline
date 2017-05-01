package org.openforis.ceo;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collector;
import java.util.stream.StreamSupport;
import spark.Request;
import spark.Response;

public class AJAX {

    private static String expandResourcePath(String filename) {
        return AJAX.class.getResource(filename).getFile();
    }

    private static JsonElement readJsonFile(String filename) {
        String jsonDataDir = expandResourcePath("/public/json/");
        try (FileReader fileReader = new FileReader(new File(jsonDataDir, filename))) {
            return (new JsonParser()).parse(fileReader);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static void writeJsonFile(String filename, JsonElement data) {
        String jsonDataDir = expandResourcePath("/public/json/");
        try (FileWriter fileWriter = new FileWriter(new File(jsonDataDir, filename))) {
            fileWriter.write(data.toString());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static Collector<JsonElement, ?, JsonArray> intoJsonArray =
        Collector.of(JsonArray::new, JsonArray::add,
                     (left, right) -> { left.addAll(right); return left; });

    public static String getAllProjects(Request req, Response res) {
        return readJsonFile("project_list.json").toString();
    }

    public static String getProjectPlots(Request req, Response res) {
        String projectId = req.body();
        return readJsonFile("plot_data_" + projectId + ".json").toString();
    }

    public static String dumpProjectAggregateData(Request req, Response res) {
        // FIXME: Write downloads/ceo_<project_name>_<yyyy-mm-dd>.csv and return its filename
        // Fields: plot_id, center_lon, center_lat, radius_m, sample_points,
        //         user_assignments, value1_%, value2_%, ..., valueN_%
        String projectId = req.body();

        // Get sample values for this project
        JsonArray projects = readJsonFile("project_list.json").getAsJsonArray();

        String[] labels = StreamSupport.stream(projects.spliterator(), false)
            .map(project -> project.getAsJsonObject())
            .filter(project -> projectId.equals(project.get("id").getAsString()))
            .map(project -> {
                    JsonArray sampleValues = project.get("sample_values").getAsJsonArray();
                    return StreamSupport.stream(sampleValues.spliterator(), false)
                        .map(sampleValue -> sampleValue.getAsJsonObject())
                        .sorted(Comparator.comparing(sampleValue -> sampleValue.get("id").getAsInt()))
                        .map(sampleValue -> sampleValue.get("name").getAsString())
                        .toArray(String[]::new);
                })
            .findFirst()
            .get();

        System.out.println("Sample Values:");
        Arrays.stream(labels).forEach(System.out::println);

        return "downloads/ceo_mekong_river_region_2017-04-29.csv";
    }

    public static String archiveProject(Request req, Response res) {
        String projectId = req.body();
        JsonArray projects = readJsonFile("project_list.json").getAsJsonArray();

        JsonArray updatedProjects = StreamSupport.stream(projects.spliterator(), false)
            .map(project -> project.getAsJsonObject())
            .map(project -> {
                    if (projectId.equals(project.get("id").getAsString())) {
                        project.remove("archived");
                        project.addProperty("archived", true);
                        return project;
                    } else {
                        return project;
                    }
                })
            .collect(intoJsonArray);

        writeJsonFile("project_list.json", updatedProjects);

        return "";
    }

    public static String addUserSamples(Request req, Response res) {
        JsonObject jsonInputs = (new JsonParser()).parse(req.body()).getAsJsonObject();
        String projectId = jsonInputs.get("projectId").getAsString();
        String plotId = jsonInputs.get("plotId").getAsString();
        String userId = jsonInputs.get("userId").getAsString();
        JsonObject userSamples = jsonInputs.get("userSamples").getAsJsonObject();

        JsonArray plots = readJsonFile("plot_data_" + projectId + ".json").getAsJsonArray();

        JsonArray updatedPlots = StreamSupport.stream(plots.spliterator(), false)
            .map(plot -> plot.getAsJsonObject())
            .map(plot -> {
                    JsonObject plotAttributes = plot.get("plot").getAsJsonObject();
                    JsonArray samples = plot.get("samples").getAsJsonArray();
                    if (plotId.equals(plotAttributes.get("id").getAsString())) {
                        int currentAnalyses = plotAttributes.get("analyses").getAsInt();
                        plotAttributes.remove("analyses");
                        plotAttributes.addProperty("analyses", currentAnalyses + 1);
                        plotAttributes.remove("user");
                        plotAttributes.addProperty("user", userId);
                        plot.remove("plot");
                        plot.add("plot", plotAttributes);
                        JsonArray updatedSamples = StreamSupport.stream(samples.spliterator(), false)
                            .map(sample -> sample.getAsJsonObject())
                            .map(sample -> {
                                    String sampleId = sample.get("id").getAsString();
                                    sample.remove("value");
                                    sample.addProperty("value", userSamples.get(sampleId).getAsInt());
                                    return sample;
                                })
                            .collect(intoJsonArray);
                        plot.remove("samples");
                        plot.add("samples", updatedSamples);
                        return plot;
                    } else {
                        return plot;
                    }
                })
            .collect(intoJsonArray);

        writeJsonFile("plot_data_" + projectId + ".json", updatedPlots);

        return "";
    }

    public static String flagPlot(Request req, Response res) {
        JsonObject jsonInputs = (new JsonParser()).parse(req.body()).getAsJsonObject();
        String projectId = jsonInputs.get("projectId").getAsString();
        String plotId = jsonInputs.get("plotId").getAsString();

        JsonArray plots = readJsonFile("plot_data_" + projectId + ".json").getAsJsonArray();

        JsonArray updatedPlots = StreamSupport.stream(plots.spliterator(), false)
            .map(plot -> plot.getAsJsonObject())
            .map(plot -> {
                    JsonObject plotAttributes = plot.get("plot").getAsJsonObject();
                    if (plotId.equals(plotAttributes.get("id").getAsString())) {
                        plotAttributes.remove("flagged");
                        plotAttributes.addProperty("flagged", true);
                        plot.remove("plot");
                        plot.add("plot", plotAttributes);
                        return plot;
                    } else {
                        return plot;
                    }
                })
            .collect(intoJsonArray);

        writeJsonFile("plot_data_" + projectId + ".json", updatedPlots);

        return "";
    }

    public static String geodashId(Request req, Response res) {
        String geodashDataDir = expandResourcePath("/public/json/");

        try (FileReader projectFileReader = new FileReader(new File(geodashDataDir, "proj.json"))) {
            JsonParser parser = new JsonParser();
            JsonArray projects = parser.parse(projectFileReader).getAsJsonArray();

            Optional matchingProject = StreamSupport.stream(projects.spliterator(), false)
                .map(project -> project.getAsJsonObject())
                .filter(project -> req.params(":id").equals(project.get("projectID").getAsString()))
                .map(project -> {
                        try (FileReader dashboardFileReader = new FileReader(new File(geodashDataDir, "dash-" + project.get("dashboard").getAsString() + ".json"))) {
                            return parser.parse(dashboardFileReader).getAsJsonObject();
                        } catch (Exception e) {
                            throw new RuntimeException(e);
                        }
                    })
                .findFirst();

            if (matchingProject.isPresent()) {
                if (req.queryParams("callback") != null) {
                    return req.queryParams("callback") + "(" + matchingProject.get().toString() + ")";
                } else {
                    return matchingProject.get().toString();
                }
            } else {
                if (true) { // FIXME: Make sure this is true if the user has role admin
                    String newUUID = UUID.randomUUID().toString();

                    JsonObject newProject = new JsonObject();
                    newProject.addProperty("projectID", req.params(":id"));
                    newProject.addProperty("dashboard", newUUID);
                    projects.add(newProject);

                    try (FileWriter projectFileWriter = new FileWriter(new File(geodashDataDir, "proj.json"))) {
                        projectFileWriter.write(projects.toString());
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }

                    JsonObject newDashboard = new JsonObject();
                    newDashboard.addProperty("projectID", req.params(":id"));
                    newDashboard.addProperty("projectTitle", req.queryParams("title"));
                    newDashboard.addProperty("widgets", "[]");
                    newDashboard.addProperty("dashboardID", newUUID);

                    try (FileWriter dashboardFileWriter = new FileWriter(new File(geodashDataDir, "dash-" + newUUID + ".json"))) {
                        dashboardFileWriter.write(newDashboard.toString());
                    } catch (Exception e) {
                        throw new RuntimeException(e);
                    }

                    if (req.queryParams("callback") != null) {
                        return req.queryParams("callback") + "(" + newDashboard.toString() + ")";
                    } else {
                        return newDashboard.toString();
                    }
                } else {
                    return "No project exists with ID: " + req.params(":id") + ".";
                }
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static String updateDashBoardByID(Request req, Response res) {
        String returnString = "";

        /* Code will go here to update dashboard*/

        return  returnString;
    }

    public static String createDashBoardWidgetByID(Request req, Response res) {
        String geodashDataDir = expandResourcePath("/public/json/");
        JsonParser parser = new JsonParser();
        JsonObject dashboardObj = new JsonObject();

        try (FileReader dashboardFileReader = new FileReader(new File(geodashDataDir, "dash-" + req.queryParams("dashID") + ".json"))) {
            dashboardObj = parser.parse(dashboardFileReader).getAsJsonObject();
            dashboardObj.getAsJsonArray("widgets").add(parser.parse(URLDecoder.decode(req.queryParams("widgetJSON"), "UTF-8")).getAsJsonObject());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        try (FileWriter dashboardFileWriter = new FileWriter(new File(geodashDataDir, "dash-" + req.queryParams("dashID") + ".json"))) {
            dashboardFileWriter.write(dashboardObj.toString());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        if (req.queryParams("callback") != null) {
            return req.queryParams("callback").toString() + "()";
        } else {
            return "";
        }
    }

    public static String updateDashBoardWidgetByID(Request req, Response res) {
        try {
            deleteOrUpdate(req.queryParams("dashID"), req.params(":id"), req.queryParams("widgetJSON"), false);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        if (req.queryParams("callback") != null) {
            return req.queryParams("callback").toString() + "()";
        } else {
            return "";
        }
    }

    public static String deleteDashBoardWidgetByID(Request req, Response res) {

        deleteOrUpdate(req.queryParams("dashID"), req.params(":id"), "", true);

        if (req.queryParams("callback") != null) {
            return req.queryParams("callback").toString() + "()";
        } else {
            return "";
        }
    }

    private static void deleteOrUpdate(String dashID, String ID, String widgetJSON, boolean delete) {
        try {
            String geodashDataDir = expandResourcePath("/public/json/");
            if (geodashDataDir.indexOf("/") == 0) {
                geodashDataDir = geodashDataDir.substring(1);
            }
            JsonParser parser = new JsonParser();
            JsonObject dashboardObj = new JsonObject();
            JsonArray finalArr = new JsonArray();
            FileSystem fs = FileSystems.getDefault();
            Path path = fs.getPath(geodashDataDir + "dash-" + dashID + ".json");
            int retries = 0;
            while (retries < 200) {
                try (FileChannel fileChannel = FileChannel.open(path, StandardOpenOption.READ, StandardOpenOption.WRITE)) {
                    FileLock lock = fileChannel.tryLock();
                    ByteBuffer buffer = ByteBuffer.allocate(2000);
                    int noOfBytesRead = fileChannel.read(buffer);
                    String jsonString = "";
                    while (noOfBytesRead != -1) {
                        buffer.flip();
                        while (buffer.hasRemaining()) {
                            jsonString += (char) buffer.get();
                        }
                        buffer.clear();
                        noOfBytesRead = fileChannel.read(buffer);
                    }
                    dashboardObj = parser.parse(jsonString).getAsJsonObject();
                    JsonArray widgets = dashboardObj.getAsJsonArray("widgets");
                    for (int i = 0; i < widgets.size(); i++) {  // **line 2**
                        JsonObject childJSONObject = widgets.get(i).getAsJsonObject();
                        String wID = childJSONObject.get("id").getAsString();
                        if (wID.equals(ID)) {
                            if (!delete) {
                                JsonParser widgetParser = new JsonParser();
                                childJSONObject = widgetParser.parse(URLDecoder.decode(widgetJSON, "UTF-8")).getAsJsonObject();
                                finalArr.add(childJSONObject);
                            }
                        } else {
                            finalArr.add(childJSONObject);
                        }
                    }
                    dashboardObj.remove("widgets");
                    dashboardObj.add("widgets", finalArr);
                    byte[] inputBytes = dashboardObj.toString().getBytes();
                    ByteBuffer buffer2 = ByteBuffer.wrap(inputBytes);
                    fileChannel.truncate(0);
                    fileChannel.write(buffer2);
                    fileChannel.close();
                    retries = 201;
                } catch (Exception e) {
                    retries++;
                }
            }
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
