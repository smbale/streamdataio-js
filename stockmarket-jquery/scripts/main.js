/* jshint devel:true */
$(document).ready(function() {

    var streamdata = null,
        datas = [],
        headers = [],
        datasStringify = "<p/>",
        patchStringify = "",
        datasArray = [],
        limitNbPatch = 100,
        isPatching = false;


    $('#disconnect').hide();
    $('#patchSpinner').hide();
    $('#error').hide();
    $('#datasTab').hide();
    $('[data-toggle="popover"]').popover();
    $( "#datasTab" ).tabs();

    $('#connect').on('click', connect);
    $('#disconnect').on('click', disconnect);

    /*
    * Form validation
    */
    checkForm();
    $('#inputUrl, #inputPublicKey, #inputPrivateKey').keyup(checkForm);
    function checkForm () {
        var empty = $('#inputUrl').val().length === 0 || $('#inputPublicKey').val().length === 0 || $('#inputPrivateKey').val().length === 0;
        empty ? $('#connect').attr('disabled', 'disabled') : $('#connect').removeAttr('disabled');
    }

    /*
    * Http Headers
    */
    $('#btnAddHeader').click(addHeader);

    function addHeader() {
        headers.push({ "key" : "", "value" : "" });
        constructHeaderInput();
    }

    function updateHeader() {
        var index = $(this).attr('data-index');
        $(this).hasClass('inputKeyHeader') ? headers[index]["key"] = $(this).val() : headers[index]["value"] = $(this).val();
    }

    function removeHeader() {
        var index = $(this).attr('data-index');
        delete headers[index];
        constructHeaderInput();
    }

    function constructHeaderInput() {
        $('#headersInputCtn').html(_.template($('#headersInputTpl').html(),{headers:headers}));
        $('.btnRemoveHeader').click(removeHeader);
        $('.inputKeyHeader, .inputValueHeader').on('keyup', updateHeader);
    }


    /*
    * Streamdataio proxy connection
    */
    function connect() {
        var url = $('#inputUrl').val();
        var header = headersToArray();

        // setup key pair
        // Key pair is saved in session storage _Pk key, to enable key pair change we reset this session storage key
        window.sessionStorage._Pk = undefined;
        // you can store your key pair in a json file instead, more details in documentation
        streamdataio.Pk = $('#inputPublicKey').val();
        streamdataio.pk = $('#inputPrivateKey').val();

        // create the Streamdata source
        streamdata = streamdataio.createEventSource(url, header);

        streamdata.streamdataConfig.PROTOCOL = 'https://';
        streamdata.streamdataConfig.HOST = 'streamdata.motwin.net';
        streamdata.streamdataConfig.PORT = '';

        // add a callback when the connection is opened
        streamdata.onOpen(function() {
            $('#disconnect').show();
            $('#connect').hide();
        });

        // add a callback when data is sent by streamdata.io
        streamdata.onData(function(data) {
            console.log('Received data: ' + JSON.stringify(data));

            $('#datasTab').show();

            datas = data;

            // Render Array
            if(Object.prototype.toString.call(data) === '[object Array]' ) {
                $('#datasTab').tabs("option", "active", 0);
                constructDatasArray();
            } else {
                $('#datasTab').tabs("option", "active", 1);
            }

            // render Patched JSON Document
            datasStringify = diffUsingJS("", JSON.stringify(data, null, 2));
            $('#datasJson pre').html(datasStringify);

            // Render JSON Patch Operations
            patchStringify = "";
            $('#datasPatch pre').html(patchStringify);


        });

        // add a callback when a patch is sent by streamdata.io
        streamdata.onPatch(function(patch) {
            if(patch.length > limitNbPatch) {
                patch.splice(limitNbPatch,patch.length-limitNbPatch);

                displayError("Too many operations in patch, only " + limitNbPatch + " firsts operations are applyed");
            }
            if(!isPatching) {

                isPatching = true;
                $('#patchSpinner').show();

                console.log('Received path:' + JSON.stringify(patch));
                var oldDatas = JSON.stringify(datas, null, 2);

                // apply the json-patch to the array of values
                jsonpatch.apply(datas, patch);

                //Render Array
                if(Object.prototype.toString.call(datas) === '[object Array]' ) {
                    // add a tag to highlight datas patched
                    checkNewDatas(patch);

                    // Render datas in array
                    constructDatasArray();

                    // Clear areNew propertys added to datas
                    cleanDatasNewTags();
                }

                // render Patched JSON document
                datasStringify = diffUsingJS(oldDatas, JSON.stringify(datas, null, 2));
                $('#datasJson pre').html(datasStringify);

                // render JSON Patch Operations
                patchStringify += formatPatch(patch);
                $('#datasPatch pre').html(patchStringify);
                $("#patchCtn").scrollTop($("#patchCtn")[0].scrollHeight);

                isPatching = false;
                $('#patchSpinner').hide();
            }
        });

        // add a callback when an error occured
        streamdata.onError(function(error) {
            console.error('Received an error: ' + error.message);

            disconnect();

            displayError(error.message);
        });

        streamdata.open();
    };

    function displayError(msg) {
        $('#error').html(msg);
        $('#error').show();

        setTimeout(function() {
            $('#error').hide();
        }, 5000);
    }

    function headersToArray() {
        var out = [];
        $.each(headers, function(index, value) {
            if(value.key != "" && value.value != "") out.push(value.key+":"+value.value);
        });
        return out;
    }

    function diffUsingJS(base, newTxt, viewType) {
        viewType = viewType || 1;
        var base = difflib.stringAsLines(base),
            newTxt = difflib.stringAsLines(newTxt),
            sm = new difflib.SequenceMatcher(base, newTxt),
            opcodes = sm.get_opcodes();

        return diffview.buildView({
            baseTextLines: base,
            newTextLines: newTxt,
            opcodes: opcodes,
            baseTextName: "JSON document",
            newTextName: "JSON patched document",
            contextSize: null,
            viewType: viewType
        });
    }

    function constructDatasArray() {
        var datasHeaders = Object.keys(datas[0]);
        // delete areNew tags for render
        if(datasHeaders.indexOf('areNew') != -1) datasHeaders.splice(datasHeaders.indexOf('areNew'), 1);
        $('#datasArray').html(_.template($('#datasArrayTpl').html(),{datas: datas, datasHeaders: datasHeaders}));
    }

    function checkNewDatas(patch) {
        // add areNew property to highlight changes
        datas.map(function(item, index) {
            item.areNew = new Array();
        });

        patch.forEach(function(item) {
            var index = parseInt(item.path.substring(1, item.path.indexOf('/', 1)));
            var attribute = item.path.substring(item.path.indexOf('/', 1) + 1);
            // we keep only first level attribute
            if(attribute.indexOf('/') != -1) attribute = attribute.substring(0,attribute.indexOf('/'));
            switch(item.op) {
                case "add":
                case "replace":
                    datas[index].areNew.push(attribute);
                    break;
            }
        });
    }

    function formatPatch(patch) {
        var patchStr = syntaxHighlight(patch);
        patchStr = patchStr.replace(/{/g, '<br/>  {').replace(/}]/g, '}<br/>]');
        return "<p>"+patchStr+"</p>";
    }

    function syntaxHighlight(json) {
        json = JSON.stringify(json);
        json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
            var cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
    }

    function cleanDatasNewTags() {
        datas.map(function(item, index) {
            delete item.areNew;
        });
    }

    function disconnect() {
        streamdata.close();
        $('#connect').show();
        $('#disconnect').hide();
    };

});