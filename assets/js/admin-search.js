var table;
var lastLoadedData;

jQuery(document).ready(function($) {

    // Set modal options
    var modalOptions = {
        dismissible: true,
        opacity: 0.5,
        in_duration: 350,
        out_duration: 250,
        ready: undefined,
        complete: function() { $('.lean-overlay').remove(); } // Hack
     };

    // Initialise
    var previousSearch; // Variable to store previous search
    var editableVars = "#admin tbody td input"; // Store the selector of our inputs that can change
    $('.search-farmers').submit(function(e){ e.preventDefault(); }); // Prevent the page from refreshing
    addInputDataSorting(); // Inputs need to be sorted too!

    // Get hold of all the user (non meta) data so we can do an autocomplete against it
    $.ajax({
         url: update.ajax_url,
         type : 'post',
         data : {
             action   : 'arcarbon_admin_typeahead',
             username : $("#username-search").val()
         }
    })
    .done(function(data) {

        var userData = JSON.parse(data);  // Parse the data

        $('#username-search').autocomplete({
            minLength: 1, // This shows the min length of charcters that must be typed before the autocomplete looks for a match.
            source: typeaheadSource,
            focus: function(event, ui) {
                $('#username-search').val(ui.item.label);
                return false;
            },
            select: function(event, ui) {   // Once a value in the drop down list is selected, do the following:
                var id = ui.item.value;
                getUserData(id);
                return false;
            }
        });

        function typeaheadSource(request, response) {
            // Turns object into array for autocomplete to use (autocomplete only accepts arrays)
            var term = request.term;
            var uniqueIds = [];
            var matching = [];
            $.each(userData, function(i, farmer){
                $.each(farmer, function(key, val) {
                    if (strContains(val, term) && uniqueIds.indexOf(farmer.ID) === -1) {
                        matching.push({
                            "label" : farmer.Name + " ( " + key + " : " + val + " )",
                            "value" : farmer.ID
                        });
                        uniqueIds.push(farmer.ID);
                    }
                });
            });
            response(matching);
        }

        function strContains(val, term) {
            // Check if a string is within another in a case insensitive way
            return (val.toLowerCase().indexOf(term.toLowerCase()) !== -1);
        }

        $("#username-search").prop("disabled", false); // Enable input after the data has loaded :)

     })
     .fail(function() {
         $('#admin-error').openModal(modalOptions);
     });

    // Enable the update button on change to inputs
    $(document).on("change", editableVars, function(){
        $(this).val(this.value);
        $(".admin-update").prop("disabled", false);
        $(".admin-cancel").prop("disabled", false);
    });

    // Open up the confirmation modal on click
    $(document).on("click", ".admin-cancel", function() {  // Add confirmation modal
        $("#cancel-submit").openModal(modalOptions);
    });
    // On confirm reload the table to it's previous state
    $( document ).on( 'click', '.admin-cancel-confirm', function() {
        populateDataTables(lastLoadedData);
        $(".admin-cancel").prop("disabled", true);
        $(".admin-update").prop("disabled", true);
    });

    // Open up the confirmation modal on click
    $(document).on("click", ".admin-update", function() {  // Add confirmation modal
        $("#update-submit").openModal(modalOptions);
    });

    // When the Admin changes headers
    function addHeaderChangeHandler() {
        var previous;

        $(".edit-field-titles").on('focus', function() {
            previousVal = this.value; // Save the previous value so we can revert to it
        }).on('change', function(){

            var footerSelector = ".dataTables_scrollFootInner table tfoot tr th";
            var headerSelector = ".dataTables_scrollHeadInner table thead tr th";

            var hidden = $(this).siblings("div"); // Find the hidden div
            var th = $(this).closest("th")[0]; // Get the table header
            var index = $(footerSelector).index(th); // Get it's index
            var header = $(headerSelector)[index]; // Retrieve the header itself

            var changedVal = this.value;
            var changedKey = $(header).data("header");
            var matching = false;

            $(headerSelector).each(function(i, element) {
                if ($(element).text().trim().toLowerCase() === changedVal.trim().toLowerCase()) {
                    matching = true;
                }
            });

            if (matching === true) {
                $(this).val(previousVal);
                return;
            }
            else {
                $(header).text(this.value); // Update the header
                hidden.text(this.value); // Match the text in the hidden div (to keep size proportions)
                table.columns.adjust().draw(); // Redraw the table because widths have changed

                var headers = getFieldHeaders();
                populateDeleteFields(headers);

                // Send off all our data
                var data = {
                    changed_key   : changedKey,
                    changed_value : changedVal,
                    action        : 'arcarbon_admin_update_headers'
                };

                $.ajax({
                    url    : update.ajax_url,
                    type   : 'post',
                    data   : data
                })
                .done(function(response) {
                    console.log(response);

                })
                .fail(function() {
                  $('#admin-error').openModal(modalOptions);
              });
          }
        });

    } // Create closure to prevent pollution with previous
    addHeaderChangeHandler(); // Call the function

    $(document).on("keyup", ".add-column-input", function(){
        // When user interacts withe the add column input, make the button available
        if ($(this).val()) {
            $(".add-column-holder").prop("disabled", false);
            $(".add-column").css("background-color", "#0E6939 !important");
        }
        else {
            $(".add-column-holder").prop("disabled", true);
            $(".add-column").css("background-color", "#808080 !important");
        }
    });

    // When user interacts withe the remove column select, make the button available
    $(document).on("focus", ".remove-column-input", function(){
        $(".remove-column-holder").prop("disabled", false);
        $(".remove-column").css("background-color", "#FF4C4C !important");

    });


    // Update confirm handler is in admin-update.js
    function getUserData(id) {
         // Get the user data from their ID
         $.ajax({
             url: update.ajax_url,
             type : 'post',
             data : {
                 action : 'arcarbon_admin_retrieve',
                 id     : id
             }
         })
         .done(function(data) {
             try {
                 data = JSON.parse(data);
                 console.log(data);
                 if (!data.id) {
                     throw("No user was found under that username. Please check spelling.");
                 }
                 else {
                    lastLoadedData = data;
                    setFarmerId(data.id);
                    populateDataTables(data);
                 }
             }
             catch (e) {
                 //console.error(e);
                 handleFailure(e);
             }

         })
         .fail(function() {
           $('#admin-error').openModal(modalOptions);
         });
    }


    // Populate the tables with the Farmers field data and contact details
    function populateDataTables(data) {

        hideError();
        var headers = data.headers;
        var geojson = data.geojson;
        var email   = data.email;
        var name    = data.name;
        var rows;

        if (headers) {
            // Populate the delete select with all of the available headers
            populateDeleteFields(headers);
        }

        if (table) {
            table.destroy(); // If we had a previous table we must destroy it first
            if (("#admin").length) {
                $("#admin").remove();
                $(".update-column-div").after($(generateTable(headers))); // Create the new table
                setFarmerId(data.id); // Make sure the farmers ID is set on the table
                addHeaderChangeHandler();
            }
        }

        // Loop through all fields and make a new row for each
        if (geojson.features) {
            $("#admin tbody").remove();
            $("#admin thead").after("<tbody></tbody>");
            for (var j =0; j < geojson.features.length; j++) {
                if (geojson.features[j].geometry.type === "Polygon") { // Make sure it's a field polygon
                    rows = '<tr>';
                    $("#admin thead th").each(handleFeatures); // Does this need to be in a function?
                    rows += '</tr>';
                    $("#admin tbody").append(rows);
                }
            }
        }

        // Setup the contact details table
        var contactDetails =
            "<div class='contact-details'>" +
                "<br><br><h5 class='arcarbon-admin-h5'> Contact Details </h5>" +
                "<table class='arcarbon-admin-contact'>" +
                    "<thead class='contact-head'>" +
                        "<th><b> Name </b></th>" +
                        "<th><b> Email </b></th>" +
                        "<th><b> Address </b></th>" +
                        "<th><b> Phone </b></th>" +
                    "</thead>" +
                    "<tbody>" +
                        "<td>" + name + "</td>" +
                        "<td>" + email+ "</td>" +
                        "<td>" + "</td>" +
                        "<td>" + "</td>" +
                    "</tbody>" +
                "<table>" +
            "</div>";

        // If contact details doesnt exist create else replace it
        if ($(".contact-details").length) {
            $(".contact-details").replaceWith(contactDetails);
        }
        else {
            $(".ar-admin-container").append(contactDetails);
        }

        //console.log("\n ", isWellFormedTable($('#admin')[0]));
        //console.log("Inner", $("#admin").html());

        table = $('#admin').DataTable({
             "scrollX" : true,
             "columnDefs": [
                {
                    "orderDataType": "dom-input",
                    "type": 'string',
                    "targets": '_all'
                }
            ]
        }); // Init the table

        showTable(); // Show the finished table

        function handleFeatures(i, th) {
            // Loop through all features and create the cells/rows for each
            var head = $(th).text();
            var key  = getObjectKey(headers, head);
            var feature = geojson.features[j];

            if (key && feature.properties[key]) { // If the text in the header matches a value in our headers

                if (key === "arcarbon_field_name") {

                    rows += '<td><input class="uneditable-td" readonly="readonly" type="text" value="'+feature.properties[key]+'"></td>';
                }
                // FIX THIS
                else {
                    rows += '<td><input type="text" value="'+feature.properties[key]+'"></td>';
                }

            }
            else {
                rows += '<td><input type="text" value=""> </td>';
            }
        }
    }

    // Populates the delete fields select input
    function populateDeleteFields(headers) {


        var select = $(".remove-column-input");
        select.find('option').remove(); // Remove all options

        var blacklist = ["arcarbon_field_name", "arcarbon_description", "arcarbon_area"];

        // Repopulate
        $.each(headers, function(key, value) {
            if (blacklist.indexOf(key) === -1) {
                //console.log(key);
                select
                    .append($("<option></option>")
                    .attr("value", key)
                    .text(value));
            }
        });
    }

    function getFieldHeaders() {
        // Retrieves all the current headers for the table
        var headers = {};
        $(".dataTables_scrollHeadInner table thead tr th").each(function(i, element) {
            var key = $(element).data("header");
            var value = $(element).text();
            headers[key] = value; // Assign the key value pair
        });
        return headers;
    }

    function isWellFormedTable(table){
        // Determines whethere the table is well formed and can be used with DataTables (jQuery)

        var isWellFormed = false;
        table = $(table);

        if(table.is("table")) { // Is table
            if ( table.has("thead").length && table.has("tfoot").length && table.has("tbody") ) { // Has head and foot
                var numRows = table.find("tbody").find("tr").length;
                var numCells = table.find("tbody").find("td").length;
                var tableHead = table.find("thead").find("th");
                var tableFoot = table.find("tfoot").find("th");
                var cols =  numCells / numRows;
                if (tableHead.length === tableFoot.length) { // Number of column headings equals number of footers
                    if (cols === tableHead.length && cols === tableHead.length) { // Number of cols equals to headers and footers");
                        isWellFormed = true;
                    }
                }
            }
        }
        return isWellFormed;
    }

    // Handle bad data or user not found
    function handleFailure(error) {

        hideTable(); // Hide the table
        showError(); // Show Error

        var msg1 = "<h6><b>There was a problem with the user data</b>: No fields exist for this user yet.</h6>";
        var msg2 = "<h6><b>There was a problem with the user data</b>: User was not found.</h6>";

        if (error.name === 'SyntaxError' || error.name === 'TypeError' ) {
            _appendError(msg1); // If data (JSON) is invalid in some way
        }
        else {
            _appendError(msg2); // If user is not found
        }

        function _appendError(msg) {
            if ($(".error-holder").length) {
                $(".error-holder").replaceWith("<div class='error-holder'>"+msg+"</div>");
            }
            else {

                $("#content-inner").append("<div class='error-holder'>"+msg+"</div>");
            }
        }
    }

    // Call the confirm delete modal for deleting columns
    $(".add-column-holder").on("click", function() {
        $("#confirm-add").openModal(modalOptions);
    });

    // Click handler for when a new column button is clicked and column is added to the table
    $(".add-column-confirm").on("click", function() {

        var button = $(".add-column-input");
        var newColumn = $(".add-column-input").val();

        var data = {
            new_col_value   : newColumn,
            new_col_key     : keyifyNewColumn(newColumn),
            header_action   : "add",
            action          : 'arcarbon_admin_add_column'
        };

        $.ajax({
            url    : update.ajax_url,
            type   : 'post',
            data   : data
        })
        .done(function(response) {
            var id = getFarmerId();
            getUserData(id);
            button.val(""); // Set new column input to blank
            $(".add-column-holder").prop("disabled", true);
            $(".add-column").css("background-color", "#808080 !important");

        })
        .fail(function() {
          $('#admin-error').openModal(modalOptions);
      });

      function keyifyNewColumn(header) {
          // Create a key that matches the styling of the others i.e. arcarbon_some_random_key

          var key = "arcarbon_" + header.toLowerCase();
          var re = new RegExp(" ", "g");
          key = key.replace(/[^\w\s]/gi, '').trim().replace(re, '_');
          return key;
      }

    });

    // Call the confirm delete modal for deleting columns
    $(".remove-column-holder").on("click", function(){
        $("#confirm-delete").openModal(modalOptions);
    });

    // Click handler for when remove column button is clicked and column is removed from the table
    $(".delete-column-confirm").on("click", function(){

        var oldColumn = $(".remove-column-input").val();
        var data = {
            old_col_key   : oldColumn,
            header_action : "remove",
            action        : 'arcarbon_admin_add_column'
        };

        $.ajax({
            url    : update.ajax_url,
            type   : 'post',
            data   : data
        })
        .done(function(response) {
            var id = getFarmerId();
            getUserData(id);
            $(".remove-column-holder").prop("disabled", true);
            $(".remove-column").css("background-color", "#808080 !important");
        })
        .fail(function() {
          $('#admin-error').openModal(modalOptions);
      });
    });


    // General Functions

    // Generate the table programmatically
    function generateTable(headers) {

        var newHeader = '<tr>';
        var newFooter = '<tr>';

        for (var key in headers) {

            var value = headers[key];

            newHeader += '<th data-header="'+key+'" >'+value+'</th>';
            newFooter += '<th><header class="change-headers">Change Header: </header><input class="edit-field-titles" value="'+value+'"><div class="hidden-footer">'+value+'</div></th>';
        }
        newHeader += '</tr>';
        newFooter += '</tr>';

        var newTable = '<table id="admin" class="display nowrap" cellspacing="0" width="100%">'+
            '<thead>'+
                newHeader+
            '</thead>'+
            '<tfoot>'+
                newFooter+
            '</tfoot>'+
            '<tbody>'+
            '</tbody>'+
        '</table>';
        return newTable;
    }

    // Set the farmers ID in the #admin data
    function setFarmerId(id) {
        $("#admin").data("farmerid", id);
    }

    // Set the farmers ID in the #admin data
    function getFarmerId() {
        return $("#admin").data("farmerid");
    }

    // Find out the key of a specific value - we need this to check master name for row headers
    function getObjectKey( obj, value ) {
        for( var prop in obj ) {
            if( obj.hasOwnProperty( prop ) ) {
                 if( obj[ prop ] === value )
                     return prop;
            }
        }
    }

    function hideError() {
        $(".error-holder").hide();
    }

    function showError() {
        $(".error-holder").hide();
    }

    function hideTable() {
        $("#admin-holder").hide();
        $(".contact-details").hide();
    }
    function showTable() {
        $("#admin-holder").show();
        $(".contact-details").show();
    }

    // Allow the table to be sorted even if we use inputs rather than plain text
    function addInputDataSorting() {
        $.fn.dataTable.ext.order['dom-input'] = function (settings, col) {
            return this.api().column( col, {order:'index'} ).nodes().map( function ( td, i ) {
                var val = $('input', td).val() || $(td).text(); // Work for text or value
                return val;
            } );
        };
    }

});
