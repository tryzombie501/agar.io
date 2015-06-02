(function(window, $) {
    function load() {
        fa = true;
        
        regions_update();
        setInterval(regions_update, 18E4);

        canvas = document.getElementById("canvas");
        grid = canvas.getContext("2d");

        canvas.onmousedown = function(event) {
            if (mobile) {
                var b = event.clientX - (5 + screen_x / 5 / 2),
                    c = event.clientY - (5 + screen_x / 5 / 2);

                if (Math.sqrt(b * b + c * c) <= screen_x / 5 / 2) {
                    cursor_send();
                    socket_send(17);
                    return;
                }
            }

            cursor_x = event.clientX;
            cursor_y = event.clientY;

            cursor_update();
            cursor_send()
        };

        canvas.onmousemove = function(event) {
            cursor_x = event.clientX;
            cursor_y = event.clientY;

            cursor_update()
        };

        canvas.onmouseup = function(a) {};

        /firefox/i.test(navigator.userAgent) ? document.addEventListener("DOMMouseScroll", scroll_event, false) : document.body.onmousewheel = scroll_event;

        var key_split = false,
            key_unused = false,
            key_eject = false;

        window.onkeydown = function(event) {
            32 != event.keyCode || key_split || (cursor_send(), socket_send(17), key_split = true);
            81 != event.keyCode || key_unused || (socket_send(18), key_unused = true);
            87 != event.keyCode || key_eject || (cursor_send(), socket_send(21), key_eject = true);
            27 == event.keyCode && menu_open(true)
        };

        window.onkeyup = function(event) {
            32 == event.keyCode && (key_split = false);
            87 == event.keyCode && (key_eject = false);
            81 == event.keyCode && key_unused && (socket_send(19), key_unused = false)
        };

        window.onblur = function() {
            socket_send(19);
            key_eject = key_unused = key_split = false
        };

        window.onresize = resize;
        resize();

        window.requestAnimationFrame ? window.requestAnimationFrame(step) : setInterval(draw, 1000 / 60);

        setInterval(cursor_send, 40);
        region_code && $("#region").val(region_code);
        region_store();
        region_set($("#region").val());

        null == socket && region_code && play();
        $("#overlays").show()
    }

    function scroll_event(event) {
        user_zoom *= Math.pow(.9, event.wheelDelta / -120 || event.detail || 0);
        1 > user_zoom && (user_zoom = 1);
        user_zoom > 4 / camera_zoom && (user_zoom = 4 / camera_zoom)
    }

    function render_tree() {
        if (.35 > camera_zoom) {
            quadtree = null;
        }
        else {
            for (var a = Number.POSITIVE_INFINITY, b = Number.POSITIVE_INFINITY, c = Number.NEGATIVE_INFINITY, d = Number.NEGATIVE_INFINITY, e = 0, p = 0; p < cells_arr.length; p++) {
                cells_arr[p].shouldRender() && (e = Math.max(cells_arr[p].size, e), a = Math.min(cells_arr[p].x, a), b = Math.min(cells_arr[p].y, b), c = Math.max(cells_arr[p].x, c), d = Math.max(cells_arr[p].y, d));
            }

            quadtree = QUAD.init({
                minX: a - (e + 100),
                minY: b - (e + 100),
                maxX: c + (e + 100),
                maxY: d + (e + 100)
            });

            for (p = 0; p < cells_arr.length; p++)
                if (a = cells_arr[p], a.shouldRender())
                    for (b = 0; b < a.points.length; ++b) quadtree.insert(a.points[b])
        }
    }

    function cursor_update() {
        target_x = (cursor_x - screen_x / 2) / camera_zoom + camera_x;
        target_y = (cursor_y - screen_y / 2) / camera_zoom + camera_y
    }

    function regions_update() {
        null == X && (X = {}, $("#region").children().each(function() {
            var a = $(this),
                b = a.val();
            b && (X[b] = a.text())
        }));
        $.get("http://m.agar.io/info", function(a) {
            var b = {},
                c;
            for (c in a.regions) {
                var d = c.split(":")[0];
                b[d] = b[d] || 0;
                b[d] += a.regions[c].numPlayers
            }
            for (c in b) $('#region option[value="' + c + '"]').text(X[c] + " (" + b[c] + " players)")
        }, "json")
    }

    function menu_close() {
        $("#adsBottom").hide();
        $("#overlays").hide();
        region_store()
    }

    function region_set(a) {
        a && a != region_code && ($("#region").val() != a && $("#region").val(a),
            region_code = window.localStorage.location = a, $(".region-message").hide(), $(".region-message." + a).show(), $(".btn-needs-server").prop("disabled", false), fa && play())
    }

    function menu_open(a) {
        player_name = null;
        $("#overlays").fadeIn(a ? 200 : 3E3);
        a || $("#adsBottom").fadeIn(3E3)
    }

    function region_store() {
        $("#region").val() ? window.localStorage.location = $("#region").val() : window.localStorage.location && $("#region").val(window.localStorage.location);
        $("#region").val() ? $("#locationKnown").append($("#region")) : $("#locationUnknown").append($("#region"))
    }

    function connect() {
        console.log("Find " + region_code + region_name);

        $.ajax("http://m.agar.io/", {
            error: function() {
                setTimeout(connect, 1000)
            },
            success: function(servers) {
                servers = servers.split("\n");
                socket_create("ws://" + servers[0]);
            },
            dataType: "text",
            method: "POST",
            cache: false,
            crossDomain: true,
            data: region_code + region_name || "?"
        })
    }

    function play() {
        fa && region_code && ($("#connecting").show(), connect())
    }

    function socket_create(a) {
        if (socket) {
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;

            try {
                socket.close()
            } catch (b) {}

            socket = null
        }

        player_ids = [];
        player_cells = [];
        cells = {};
        cells_arr = [];
        cells_destroyed = [];
        leaders = [];
        v = w = null;
        player_score = 0;

        console.log("Connecting to " + a);

        socket = new WebSocket(a);

        socket.binaryType = "arraybuffer";
        socket.onopen = socket_open;
        socket.onmessage = socket_message;
        socket.onclose = socket_close;
        socket.onerror = function() {
            console.log("socket error")
        }
    }

    function socket_open(a) {
        Y = 500;
        $("#connecting").hide();

        console.log("socket open");

        a = new ArrayBuffer(5);
        var b = new DataView(a);
        b.setUint8(0, 254);
        b.setUint32(1, 4, true);
        socket.send(a);

        a = new ArrayBuffer(5);
        b = new DataView(a);
        b.setUint8(0, 255);
        b.setUint32(1, 1, true);
        socket.send(a);

        name_send()
    }

    function socket_close(a) {
        console.log("socket close");
        setTimeout(play, Y);
        Y *= 1.5
    }

    function socket_message(a) {

        function name() {
            for (var a = "";;) {
                var b = data.getUint16(c, true);
                c += 2;
                if (0 == b) break;
                a += String.fromCharCode(b)
            }
            return a
        }

        var c = 1, data = new DataView(a.data);

        switch (data.getUint8(0)) {
            // update cell data
            case 16:
                cells_update(data);
                break;
            // not sure yet
            case 17:
                player_x = data.getFloat32(1, true);
                player_y = data.getFloat32(5, true);
                player_zoom = data.getFloat32(9, true);
                break;
            // not sure yet
            case 20:
                player_cells = [];
                player_ids = [];
                break;
            // update player cell ids
            case 32:
                player_ids.push(data.getUint32(1, true));
                break;
            // update leaderboard
            case 49:
                if (null != w) break;

                a = data.getUint32(c, true);
                c += 4;
                leaders = [];

                for (var e = 0; e < a; ++e) {
                    var id = data.getUint32(c, true),
                        c = c + 4;
                    leaders.push({
                        id: id,
                        name: name()
                    })
                }

                leaderboard_update();

                break;
            // not sure yet
            case 50:
                w = [];
                a = data.getUint32(c, true);
                c += 4;

                for (e = 0; e < a; ++e) {
                    w.push(data.getFloat32(c, true)), c += 4;
                }

                leaderboard_update();
                break;
            // get initial world params
            case 64:
                min_x = data.getFloat64(1, true);
                min_y = data.getFloat64(9, true);

                max_x = data.getFloat64(17, true);
                max_y = data.getFloat64(25, true);

                player_x = (max_x + min_x) / 2;
                player_y = (max_y + min_y) / 2;
                player_zoom = 1;

                0 == player_cells.length && (camera_x = player_x, camera_y = player_y, camera_zoom = player_zoom)
        }
    }

    function cells_update(a) {

        update_time = +new Date;

        var update_code = Math.random(),
            c = 1;

        player_alive = false;

        for (var id = a.getUint16(c, true), c = c + 2, e = 0; e < id; ++e) {
            var player = cells[a.getUint32(c, true)],
                victim = cells[a.getUint32(c + 4, true)],
                c = c + 8;

            player && victim && (victim.destroy(), victim.ox = victim.x, victim.oy = victim.y, victim.oSize = victim.size, victim.nx = player.x, victim.ny = player.y, victim.nSize = victim.size, victim.updateTime = update_time)
        }

        for (e = 0;;) {
            // get id
            id = a.getUint32(c, true);
            c += 4;
            
            // not a player
            if (0 == id) break;

            ++e;
            
            var g, x = a.getInt16(c, true),
                c = c + 2,
                y = a.getInt16(c, true),
                c = c + 2;

            g = a.getInt16(c, true);

            for (var c = c + 2,
                color = a.getUint8(c++),
                q = a.getUint8(c++),
                m = a.getUint8(c++),
                color = (color << 16 | q << 8 | m).toString(16); 6 > color.length;)
                color = "0" + color;
            
            var cell,
                color = "#" + color,
                type = a.getUint8(c++),
                is_virus = !!(type & 1),
                is_agitated = !!(type & 16);

            type & 2 && (c += 4);
            type & 4 && (c += 8);
            type & 8 && (c += 16);

            for (var l, name = "";;) {
                l = a.getUint16(c, true);
                c += 2;
                if (0 == l) break;
                name += String.fromCharCode(l)
            }
            
            cells.hasOwnProperty(id) ? (cell = cells[id], cell.updatePos(), cell.ox = cell.x, cell.oy = cell.y, cell.oSize = cell.size, cell.color = color) : (cell = new Cell(id, x, y, g, color, name), cell.pX = x, cell.pY = y);
            
            cell.isVirus = is_virus;
            cell.isAgitated = is_agitated;
            cell.nx = x;
            cell.ny = y;
            cell.nSize = g;
            cell.updateCode = update_code;
            cell.updateTime = update_time;

            - 1 != player_ids.indexOf(id) && -1 == player_cells.indexOf(cell) && (document.getElementById("overlays").style.display = "none", player_cells.push(cell), 1 == player_cells.length && (camera_x = cell.x, camera_y = cell.y))
        }

        var b = a.getUint32(c, true);
        c += 4;

        for (e = 0; e < b; e++) {
            id = a.getUint32(c, true);
            c += 4;
            cell = cells[id];
            null != cell && cell.destroy();
        }

        player_alive && 0 == player_cells.length && menu_open(false)
    }

    function cursor_send() {
        if (socket_ready()) {
            var a = cursor_x - screen_x / 2,
                b = cursor_y - screen_y / 2;
            64 > a * a + b * b || Ba == target_x && Ca == target_y || (Ba = target_x, Ca = target_y, a = new ArrayBuffer(21), b = new DataView(a), b.setUint8(0, 16), b.setFloat64(1, target_x, true), b.setFloat64(9, target_y, true), b.setUint32(17, 0, true), socket.send(a))
        }
    }

    function name_send() {
        if (socket_ready() && null != player_name) {
            var a = new ArrayBuffer(1 + 2 * player_name.length),
                b = new DataView(a);

            b.setUint8(0, 0);

            for (var c = 0; c < player_name.length; ++c) {
                b.setUint16(1 + 2 * c, player_name.charCodeAt(c), true);
            }

            socket.send(a)
        }
    }

    function socket_ready() {
        return null != socket && socket.readyState == socket.OPEN
    }

    function socket_send(a) {
        if (socket_ready()) {
            var b = new ArrayBuffer(1);
            (new DataView(b)).setUint8(0, a);
            socket.send(b)
        }
    }

    function step() {
        draw();
        window.requestAnimationFrame(step)
    }

    function resize() {
        screen_x = window.innerWidth;
        screen_y = window.innerHeight;
        canvas.width = canvas.width = screen_x;
        canvas.height = canvas.height = screen_y;
        draw()
    }

    function zoom_factor() {
        var a;
        a = 1 * Math.max(screen_y / 1080, screen_x / 1920);
        return a *= user_zoom
    }

    function zoom_update() {
        if (0 != player_cells.length) {
            for (var a = 0, b = 0; b < player_cells.length; b++) {
                a += player_cells[b].size;
            }

            a = Math.pow(Math.min(64 / a, 1), .4) * zoom_factor();
            camera_zoom = (9 * camera_zoom + a) / 10
        }
    }

    function draw() {
        var b, a, time = +new Date;
        ++frame;

        update_time = +new Date;

        if (0 < player_cells.length) {
            zoom_update();

            for (var i = b = a = 0; i < player_cells.length; i++) {
                player_cells[i].updatePos();
                a += player_cells[i].x / player_cells.length;
                b += player_cells[i].y / player_cells.length;
            };

            player_x = a;
            player_y = b;
            player_zoom = camera_zoom;

            camera_x = (camera_x + a) / 2;
            camera_y = (camera_y + b) / 2;
        } else {
            camera_x = (29 * camera_x + player_x) / 30;
            camera_y = (29 * camera_y + player_y) / 30;
            camera_zoom = (9 * camera_zoom + player_zoom * zoom_factor()) / 10;
        }

        render_tree();
        cursor_update();
        grid.clearRect(0, 0, screen_x, screen_y);
        grid.fillStyle = setting_dark ? "#111111" : "#F2FBFF";
        grid.fillRect(0, 0, screen_x, screen_y);
        grid.save();
        grid.strokeStyle = setting_dark ? "#AAAAAA" : "#000000";
        grid.globalAlpha = .2;
        grid.scale(camera_zoom, camera_zoom);

        a = screen_x / camera_zoom;
        b = screen_y / camera_zoom;

        for (i = -.5 + (-camera_x + a / 2) % 50; i < a; i += 50) {
            grid.beginPath();
            grid.moveTo(i, 0);
            grid.lineTo(i, b);
            grid.stroke();
        }

        for (i = -.5 + (-camera_y + b / 2) % 50; i < b; i += 50) {
            grid.beginPath();
            grid.moveTo(0, i);
            grid.lineTo(a, i);
            grid.stroke();
        }

        grid.restore();

        cells_arr.sort(function(a, b) {
            return a.size == b.size ? a.id - b.id : a.size - b.size
        });

        grid.save();
        grid.translate(screen_x / 2, screen_y / 2);
        grid.scale(camera_zoom, camera_zoom);
        grid.translate(-camera_x, -camera_y);

        for (i = 0; i < cells_destroyed.length; i++) cells_destroyed[i].draw();
        for (i = 0; i < cells_arr.length; i++) cells_arr[i].draw();

        grid.restore();

        v && v.width && grid.drawImage(v, screen_x - v.width - 10, 10);

        player_score = Math.max(player_score, calculate_score());

        0 != player_score && (null == ca && (ca = new Text(24, "#FFFFFF")), ca.setValue("Score: " + ~~(player_score / 100)), b = ca.render(), a = b.width, grid.globalAlpha = .2, grid.fillStyle = "#000000", grid.fillRect(10, screen_y - 10 - 24 - 10, a + 10, 34), grid.globalAlpha = 1, grid.drawImage(b, 15, screen_y - 10 - 24 - 5));
        
        draw_split();

        time = +new Date - time;
        time > 1000 / 60 ? a -= .01 : time < 1000 / 65 && (a += .01);

        .4 > a && (a = .4);
        1 < a && (a = 1);
    }

    function draw_split() {
        if (mobile && split_image.width) {
            var a = screen_x / 5;
            grid.drawImage(split_image, 5, 5, a, a)
        }
    }

    function calculate_score() {
        for (var a = 0, b = 0; b < player_cells.length; b++) {
            a += player_cells[b].nSize * player_cells[b].nSize;
        }

        return a
    }

    function leaderboard_update() {
        v = null;
        if (null != w || 0 != leaders.length)
            if (null != w || setting_names) {
                v = document.createElement("canvas");
                var a = v.getContext("2d"),
                    b = 60,
                    b = null == w ? b + 24 * leaders.length : b + 180,
                    c = Math.min(200, .3 * screen_x) / 200;
                v.width = 200 * c;
                v.height = b * c;
                a.scale(c, c);
                a.globalAlpha = .4;
                a.fillStyle = "#000000";
                a.fillRect(0, 0, 200, b);
                a.globalAlpha = 1;
                a.fillStyle = "#FFFFFF";
                c = null;
                c = "Leaderboard";
                a.font = "30px Ubuntu";
                a.fillText(c, 100 - a.measureText(c).width / 2, 40);
                if (null == w)
                    for (a.font = "20px Ubuntu", b = 0; b < leaders.length; ++b) c = leaders[b].name || "An unnamed cell", setting_names || (c = "An unnamed cell"), -1 != player_ids.indexOf(leaders[b].id) ? (player_cells[0].name && (c = player_cells[0].name), a.fillStyle = "#FFAAAA") : a.fillStyle = "#FFFFFF", c = b + 1 + ". " + c, a.fillText(c, 100 - a.measureText(c).width /
                        2, 70 + 24 * b);
                else
                    for (b = c = 0; b < w.length; ++b) angEnd = c + w[b] * Math.PI * 2, a.fillStyle = team_colors[b + 1], a.beginPath(), a.moveTo(100, 140), a.arc(100, 140, 80, c, angEnd, false), a.fill(), c = angEnd
            }
    }

    function Cell(id, ox, oy, size, color, name) {
        cells_arr.push(this);
        cells[id] = this;
        this.id = id;
        this.ox = this.x = ox;
        this.oy = this.y = oy;
        this.oSize = this.size = size;
        this.color = color;
        this.points = [];
        this.pointsAcc = [];
        this.createPoints();
        this.setName(name)
    }

    function Text(size, color, stroke, stroke_color) {
        size && (this._size = size);
        color && (this._color = color);
        this._stroke = !!stroke;
        stroke_color && (this._strokeColor = stroke_color)
    }

    var grid, canvas, screen_x, screen_y, quadtree = null,
        socket = null,
        camera_x = 0,
        camera_y = 0,
        player_ids = [],
        player_cells = [],
        cells = {},
        cells_arr = [],
        cells_destroyed = [],
        leaders = [],
        cursor_x = 0,
        cursor_y = 0,
        target_x = -1,
        target_y = -1,
        frame = 0,
        update_time = 0,
        player_name = null,
        min_x = 0,
        min_y = 0,
        max_x = 1E4,
        max_y = 1E4,
        camera_zoom = 1,
        region_code = null,
        setting_skins = true,
        setting_names = true,
        setting_colors = false,
        player_alive = false,
        player_score = 0,
        setting_dark = false,
        setting_mass = false,
        player_x = camera_x = ~~((min_x + max_x) / 2),
        player_y = camera_y = ~~((min_y + max_y) / 2),
        player_zoom = 1,
        region_name = "",
        w = null,
        fa = false,
        canvas = 0,
        team_colors = ["#333333", "#FF3333", "#33FF33", "#3333FF"],
        user_zoom = 1,
        mobile = "ontouchstart" in window && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        split_image = new Image;

    split_image.src = "img/split.png";

    canvas = document.createElement("canvas");

    if ("undefined" == typeof console || "undefined" == typeof DataView || "undefined" == typeof WebSocket || null == canvas || null == canvas.getContext || null == window.localStorage) {
        alert("You browser does not support this game, we recommend you to use Firefox to play this");
    }
    else {
        var X = null;
        window.setNick = function(value) {
            menu_close();
            player_name = value;
            name_send();
            player_score = 0
        };
        window.setRegion = region_set;
        window.setSkins = function(value) {
            setting_skins = value;
        };
        window.setNames = function(value) {
            setting_names = value;
        };
        window.setDarkTheme = function(value) {
            setting_dark = value;
        };
        window.setColors = function(value) {
            setting_colors = value;
        };
        window.setShowMass = function(value) {
            setting_mass = value;
        };
        window.spectate = function() {
            player_name = null;
            socket_send(1);
            menu_close()
        };
        window.setGameMode = function(a) {
            a != region_name && (region_name = a, play())
        };
        null != window.localStorage && (null == window.localStorage.AB8 && (window.localStorage.AB8 = 0 + ~~(100 * Math.random())), canvas = +window.localStorage.AB8, window.ABGroup = canvas);
        
        $.get("http://gc.agar.io", function(a) {
            var b = a.split(" ");
            a = b[0];
            b = b[1] || ""; - 1 == "DE IL PL HU BR AT".split(" ").indexOf(a) && Ga.push("nazi");
            Q.hasOwnProperty(a) && ("string" == typeof Q[a] ? region_code || region_set(Q[a]) : Q[a].hasOwnProperty(b) && (region_code || region_set(Q[a][b])))
        }, "text");

        setTimeout(function() {}, 3E5);

        var Q = {
            AF: "JP-Tokyo",
            AX: "EU-London",
            AL: "EU-London",
            DZ: "EU-London",
            AS: "SG-Singapore",
            AD: "EU-London",
            AO: "EU-London",
            AI: "US-Atlanta",
            AG: "US-Atlanta",
            AR: "BR-Brazil",
            AM: "JP-Tokyo",
            AW: "US-Atlanta",
            AU: "SG-Singapore",
            AT: "EU-London",
            AZ: "JP-Tokyo",
            BS: "US-Atlanta",
            BH: "JP-Tokyo",
            BD: "JP-Tokyo",
            BB: "US-Atlanta",
            BY: "EU-London",
            BE: "EU-London",
            BZ: "US-Atlanta",
            BJ: "EU-London",
            BM: "US-Atlanta",
            BT: "JP-Tokyo",
            BO: "BR-Brazil",
            BQ: "US-Atlanta",
            BA: "EU-London",
            BW: "EU-London",
            BR: "BR-Brazil",
            IO: "JP-Tokyo",
            VG: "US-Atlanta",
            BN: "JP-Tokyo",
            BG: "EU-London",
            BF: "EU-London",
            BI: "EU-London",
            KH: "JP-Tokyo",
            CM: "EU-London",
            CA: "US-Atlanta",
            CV: "EU-London",
            KY: "US-Atlanta",
            CF: "EU-London",
            TD: "EU-London",
            CL: "BR-Brazil",
            CN: "CN-China",
            CX: "JP-Tokyo",
            CC: "JP-Tokyo",
            CO: "BR-Brazil",
            KM: "EU-London",
            CD: "EU-London",
            CG: "EU-London",
            CK: "SG-Singapore",
            CR: "US-Atlanta",
            CI: "EU-London",
            HR: "EU-London",
            CU: "US-Atlanta",
            CW: "US-Atlanta",
            CY: "JP-Tokyo",
            CZ: "EU-London",
            DK: "EU-London",
            DJ: "EU-London",
            DM: "US-Atlanta",
            DO: "US-Atlanta",
            EC: "BR-Brazil",
            EG: "EU-London",
            SV: "US-Atlanta",
            GQ: "EU-London",
            ER: "EU-London",
            EE: "EU-London",
            ET: "EU-London",
            FO: "EU-London",
            FK: "BR-Brazil",
            FJ: "SG-Singapore",
            FI: "EU-London",
            FR: "EU-London",
            GF: "BR-Brazil",
            PF: "SG-Singapore",
            GA: "EU-London",
            GM: "EU-London",
            GE: "JP-Tokyo",
            DE: "EU-London",
            GH: "EU-London",
            GI: "EU-London",
            GR: "EU-London",
            GL: "US-Atlanta",
            GD: "US-Atlanta",
            GP: "US-Atlanta",
            GU: "SG-Singapore",
            GT: "US-Atlanta",
            GG: "EU-London",
            GN: "EU-London",
            GW: "EU-London",
            GY: "BR-Brazil",
            HT: "US-Atlanta",
            VA: "EU-London",
            HN: "US-Atlanta",
            HK: "JP-Tokyo",
            HU: "EU-London",
            IS: "EU-London",
            IN: "JP-Tokyo",
            ID: "JP-Tokyo",
            IR: "JP-Tokyo",
            IQ: "JP-Tokyo",
            IE: "EU-London",
            IM: "EU-London",
            IL: "JP-Tokyo",
            IT: "EU-London",
            JM: "US-Atlanta",
            JP: "JP-Tokyo",
            JE: "EU-London",
            JO: "JP-Tokyo",
            KZ: "JP-Tokyo",
            KE: "EU-London",
            KI: "SG-Singapore",
            KP: "JP-Tokyo",
            KR: "JP-Tokyo",
            KW: "JP-Tokyo",
            KG: "JP-Tokyo",
            LA: "JP-Tokyo",
            LV: "EU-London",
            LB: "JP-Tokyo",
            LS: "EU-London",
            LR: "EU-London",
            LY: "EU-London",
            LI: "EU-London",
            LT: "EU-London",
            LU: "EU-London",
            MO: "JP-Tokyo",
            MK: "EU-London",
            MG: "EU-London",
            MW: "EU-London",
            MY: "JP-Tokyo",
            MV: "JP-Tokyo",
            ML: "EU-London",
            MT: "EU-London",
            MH: "SG-Singapore",
            MQ: "US-Atlanta",
            MR: "EU-London",
            MU: "EU-London",
            YT: "EU-London",
            MX: "US-Atlanta",
            FM: "SG-Singapore",
            MD: "EU-London",
            MC: "EU-London",
            MN: "JP-Tokyo",
            ME: "EU-London",
            MS: "US-Atlanta",
            MA: "EU-London",
            MZ: "EU-London",
            MM: "JP-Tokyo",
            NA: "EU-London",
            NR: "SG-Singapore",
            NP: "JP-Tokyo",
            NL: "EU-London",
            NC: "SG-Singapore",
            NZ: "SG-Singapore",
            NI: "US-Atlanta",
            NE: "EU-London",
            NG: "EU-London",
            NU: "SG-Singapore",
            NF: "SG-Singapore",
            MP: "SG-Singapore",
            NO: "EU-London",
            OM: "JP-Tokyo",
            PK: "JP-Tokyo",
            PW: "SG-Singapore",
            PS: "JP-Tokyo",
            PA: "US-Atlanta",
            PG: "SG-Singapore",
            PY: "BR-Brazil",
            PE: "BR-Brazil",
            PH: "JP-Tokyo",
            PN: "SG-Singapore",
            PL: "EU-London",
            PT: "EU-London",
            PR: "US-Atlanta",
            QA: "JP-Tokyo",
            RE: "EU-London",
            RO: "EU-London",
            RU: "RU-Russia",
            RW: "EU-London",
            BL: "US-Atlanta",
            SH: "EU-London",
            KN: "US-Atlanta",
            LC: "US-Atlanta",
            MF: "US-Atlanta",
            PM: "US-Atlanta",
            VC: "US-Atlanta",
            WS: "SG-Singapore",
            SM: "EU-London",
            ST: "EU-London",
            SA: "EU-London",
            SN: "EU-London",
            RS: "EU-London",
            SC: "EU-London",
            SL: "EU-London",
            SG: "JP-Tokyo",
            SX: "US-Atlanta",
            SK: "EU-London",
            SI: "EU-London",
            SB: "SG-Singapore",
            SO: "EU-London",
            ZA: "EU-London",
            SS: "EU-London",
            ES: "EU-London",
            LK: "JP-Tokyo",
            SD: "EU-London",
            SR: "BR-Brazil",
            SJ: "EU-London",
            SZ: "EU-London",
            SE: "EU-London",
            CH: "EU-London",
            SY: "EU-London",
            TW: "JP-Tokyo",
            TJ: "JP-Tokyo",
            TZ: "EU-London",
            TH: "JP-Tokyo",
            TL: "JP-Tokyo",
            TG: "EU-London",
            TK: "SG-Singapore",
            TO: "SG-Singapore",
            TT: "US-Atlanta",
            TN: "EU-London",
            TR: "TK-Turkey",
            TM: "JP-Tokyo",
            TC: "US-Atlanta",
            TV: "SG-Singapore",
            UG: "EU-London",
            UA: "EU-London",
            AE: "EU-London",
            GB: "EU-London",
            US: {
                AL: "US-Atlanta",
                AK: "US-Fremont",
                AZ: "US-Fremont",
                AR: "US-Atlanta",
                CA: "US-Fremont",
                CO: "US-Fremont",
                CT: "US-Atlanta",
                DE: "US-Atlanta",
                FL: "US-Atlanta",
                GA: "US-Atlanta",
                HI: "US-Fremont",
                ID: "US-Fremont",
                IL: "US-Atlanta",
                IN: "US-Atlanta",
                IA: "US-Atlanta",
                KS: "US-Atlanta",
                KY: "US-Atlanta",
                LA: "US-Atlanta",
                ME: "US-Atlanta",
                MD: "US-Atlanta",
                MA: "US-Atlanta",
                MI: "US-Atlanta",
                MN: "US-Fremont",
                MS: "US-Atlanta",
                MO: "US-Atlanta",
                MT: "US-Fremont",
                NE: "US-Fremont",
                NV: "US-Fremont",
                NH: "US-Atlanta",
                NJ: "US-Atlanta",
                NM: "US-Fremont",
                NY: "US-Atlanta",
                NC: "US-Atlanta",
                ND: "US-Fremont",
                OH: "US-Atlanta",
                OK: "US-Atlanta",
                OR: "US-Fremont",
                PA: "US-Atlanta",
                RI: "US-Atlanta",
                SC: "US-Atlanta",
                SD: "US-Fremont",
                TN: "US-Atlanta",
                TX: "US-Atlanta",
                UT: "US-Fremont",
                VT: "US-Atlanta",
                VA: "US-Atlanta",
                WA: "US-Fremont",
                WV: "US-Atlanta",
                WI: "US-Atlanta",
                WY: "US-Fremont",
                DC: "US-Atlanta",
                AS: "US-Atlanta",
                GU: "US-Atlanta",
                MP: "US-Atlanta",
                PR: "US-Atlanta",
                UM: "US-Atlanta",
                VI: "US-Atlanta"
            },
            UM: "SG-Singapore",
            VI: "US-Atlanta",
            UY: "BR-Brazil",
            UZ: "JP-Tokyo",
            VU: "SG-Singapore",
            VE: "BR-Brazil",
            VN: "JP-Tokyo",
            WF: "SG-Singapore",
            EH: "EU-London",
            YE: "JP-Tokyo",
            ZM: "EU-London",
            ZW: "EU-London"
        };

        window.connect = socket_create;

        var Y = 500,
            Ba = -1,
            Ca = -1,
            v = null,
            x = 1,
            ca = null,
            I = {},
            Ga = "poland;usa;china;russia;canada;australia;spain;brazil;germany;ukraine;france;sweden;hitler;north korea;south korea;japan;united kingdom;earth;greece;latvia;lithuania;estonia;finland;norway;cia;maldivas;austria;nigeria;reddit;yaranaika;confederate;9gag;indiana;4chan;italy;ussr;bulgaria;tumblr;2ch.hk;hong kong;portugal;jamaica;german empire;mexico;sanik;switzerland;croatia;chile;indonesia;bangladesh;thailand;iran;iraq;peru;moon;botswana;bosnia;netherlands;european union;taiwan;pakistan;hungary;satanist;qing dynasty;matriarchy;patriarchy;feminism;ireland;texas;facepunch;prodota;cambodia;steam;piccolo;ea;india;kc;denmark;quebec;ayy lmao;sealand;bait;tsarist russia;origin;vinesauce;stalin;belgium;luxembourg;stussy;prussia;8ch;argentina;scotland;sir;romania;belarus;wojak;doge;nasa;byzantium;imperial japan;french kingdom;somalia;turkey;mars;pokerface;8;irs;receita federal".split(";"),
            Sa = ["8", "nasa"],
            Ta = ["m'blob"];

        Cell.prototype = {
            id: 0,
            points: null,
            pointsAcc: null,
            name: null,
            nameCache: null,
            sizeCache: null,
            x: 0,
            y: 0,
            size: 0,
            ox: 0,
            oy: 0,
            oSize: 0,
            nx: 0,
            ny: 0,
            nSize: 0,
            updateTime: 0,
            updateCode: 0,
            drawTime: 0,
            destroyed: false,
            isVirus: false,
            isAgitated: false,
            wasSimpleDrawing: true,
            destroy: function() {
                var a;
                for (a = 0; a < cells_arr.length; a++)
                    if (cells_arr[a] == this) {
                        cells_arr.splice(a, 1);
                        break
                    }
                delete cells[this.id];
                a = player_cells.indexOf(this); - 1 != a && (player_alive = true, player_cells.splice(a, 1));
                a = player_ids.indexOf(this.id); - 1 != a && player_ids.splice(a, 1);
                this.destroyed = true;
                cells_destroyed.push(this)
            },
            getNameSize: function() {
                return Math.max(~~(.3 * this.size), 24)
            },
            setName: function(a) {
                if (this.name = a) null == this.nameCache ? this.nameCache = new Text(this.getNameSize(), "#FFFFFF", true, "#000000") : this.nameCache.setSize(this.getNameSize()), this.nameCache.setValue(this.name)
            },
            createPoints: function() {
                for (var a = this.getNumPoints(); this.points.length > a;) {
                    var b = ~~(Math.random() * this.points.length);
                    this.points.splice(b, 1);
                    this.pointsAcc.splice(b, 1)
                }
                0 == this.points.length && 0 < a && (this.points.push({
                    c: this,
                    v: this.size,
                    x: this.x,
                    y: this.y
                }), this.pointsAcc.push(Math.random() - .5));
                for (; this.points.length < a;) {
                    var b = ~~(Math.random() * this.points.length),
                        c = this.points[b];
                    this.points.splice(b, 0, {
                        c: this,
                        v: c.v,
                        x: c.x,
                        y: c.y
                    });
                    this.pointsAcc.splice(b, 0, this.pointsAcc[b])
                }
            },
            getNumPoints: function() {
                var a = 10;
                20 > this.size && (a = 5);
                this.isVirus && (a = 30);
                return ~~Math.max(this.size * camera_zoom * (this.isVirus ? Math.min(2 * x, 1) : x), a)
            },
            movePoints: function() {
                this.createPoints();
                for (var a = this.points, b = this.pointsAcc, c = a.length, d = 0; d < c; ++d) {
                    var e = b[(d - 1 + c) % c],
                        f = b[(d + 1) % c];
                    b[d] += (Math.random() - .5) * (this.isAgitated ? 3 : 1);
                    b[d] *= .7;
                    10 < b[d] && (b[d] = 10); - 10 > b[d] && (b[d] = -10);
                    b[d] = (e + f + 8 * b[d]) / 10
                }
                for (var h = this, d = 0; d < c; ++d) {
                    var g = a[d].v,
                        e = a[(d - 1 + c) % c].v,
                        f = a[(d + 1) % c].v;
                    if (15 < this.size && null != quadtree) {
                        var l = false,
                            m = a[d].x,
                            n = a[d].y;
                        quadtree.retrieve2(m - 5, n - 5, 10, 10, function(a) {
                            a.c != h && 25 > (m - a.x) * (m - a.x) + (n - a.y) * (n - a.y) && (l = true)
                        });
                        !l && (a[d].x < min_x || a[d].y < g || a[d].x > max_x || a[d].y > max_y) && (l = true);
                        l && (0 < b[d] && (b[d] = 0), b[d] -= 1)
                    }
                    g += b[d];
                    0 > g && (g = 0);
                    g = this.isAgitated ? (19 * g + this.size) / 20 : (12 * g + this.size) / 13;
                    a[d].v = (e + f + 8 * g) / 10;
                    e = 2 * Math.PI / c;
                    f = this.points[d].v;
                    this.isVirus && 0 == d % 2 && (f += 5);
                    a[d].x = this.x + Math.cos(e * d) * f;
                    a[d].y = this.y + Math.sin(e * d) * f
                }
            },
            updatePos: function() {
                var a;
                a = (update_time - this.updateTime) / 120;
                a = 0 > a ? 0 : 1 < a ? 1 : a;
                var b = 0 > a ? 0 : 1 < a ? 1 : a;
                this.getNameSize();
                if (this.destroyed && 1 <= b) {
                    var c = cells_destroyed.indexOf(this); - 1 != c && cells_destroyed.splice(c, 1)
                }
                this.x = a * (this.nx - this.ox) + this.ox;
                this.y = a * (this.ny - this.oy) + this.oy;
                this.size = b * (this.nSize - this.oSize) + this.oSize;
                return b
            },
            shouldRender: function() {
                return this.x + this.size + 40 < camera_x - screen_x / 2 / camera_zoom || this.y + this.size + 40 < camera_y - screen_y / 2 / camera_zoom || this.x - this.size - 40 >
                    camera_x + screen_x / 2 / camera_zoom || this.y - this.size - 40 > camera_y + screen_y / 2 / camera_zoom ? false : true
            },
            draw: function() {
                if (this.shouldRender()) {
                    var a = !this.isVirus && !this.isAgitated && .35 > camera_zoom;
                    if (this.wasSimpleDrawing && !a)
                        for (var b = 0; b < this.points.length; b++) this.points[b].v = this.size;
                    this.wasSimpleDrawing = a;
                    grid.save();
                    this.drawTime = update_time;
                    b = this.updatePos();
                    this.destroyed && (grid.globalAlpha *= 1 - b);
                    grid.lineWidth = 10;
                    grid.lineCap = "round";
                    grid.lineJoin = this.isVirus ? "mitter" : "round";
                    setting_colors ? (grid.fillStyle = "#FFFFFF", grid.strokeStyle = "#AAAAAA") : (grid.fillStyle = this.color, grid.strokeStyle = this.color);
                    if (a) grid.beginPath(), grid.arc(this.x, this.y, this.size, 0, 2 * Math.PI, false);
                    else {
                        this.movePoints();
                        grid.beginPath();
                        var c = this.getNumPoints();
                        grid.moveTo(this.points[0].x, this.points[0].y);
                        for (b = 1; b <= c; ++b) {
                            var d = b % c;
                            grid.lineTo(this.points[d].x, this.points[d].y)
                        }
                    }
                    grid.closePath();
                    c = this.name.toLowerCase();
                    !this.isAgitated && setting_skins && "" == region_name ? -1 != Ga.indexOf(c) ? (I.hasOwnProperty(c) || (I[c] = new Image, I[c].src = "skins/" + c + ".png"), b = 0 != I[c].width && I[c].complete ? I[c] : null) : b = null : b = null;
                    b = (d = b) ? -1 != Ta.indexOf(c) : false;
                    a || grid.stroke();
                    grid.fill();
                    null == d || b || (grid.save(), grid.clip(), grid.drawImage(d, this.x - this.size, this.y - this.size, 2 * this.size, 2 * this.size), grid.restore());
                    (setting_colors || 15 < this.size) && !a && (grid.strokeStyle = "#000000", grid.globalAlpha *= .1, grid.stroke());
                    grid.globalAlpha = 1;
                    null != d && b && grid.drawImage(d, this.x - 2 * this.size, this.y - 2 * this.size, 4 * this.size, 4 * this.size);
                    b = -1 != player_cells.indexOf(this);
                    a = ~~this.y;
                    if ((setting_names || b) && this.name && this.nameCache && (null == d || -1 == Sa.indexOf(c))) {
                        d = this.nameCache;
                        d.setValue(this.name);
                        d.setSize(this.getNameSize());
                        c = Math.ceil(10 * camera_zoom) / 10;
                        d.setScale(c);
                        var d = d.render(),
                            f = ~~(d.width / c),
                            g = ~~(d.height / c);
                        grid.drawImage(d, ~~this.x - ~~(f / 2), a - ~~(g / 2), f, g);
                        a += d.height / 2 / c + 4
                    }
                    setting_mass && (b || 0 == player_cells.length && (!this.isVirus || this.isAgitated) && 20 < this.size) && (null == this.sizeCache && (this.sizeCache = new Text(this.getNameSize() / 2, "#FFFFFF", true, "#000000")), b = this.sizeCache, b.setSize(this.getNameSize() / 2), b.setValue(~~(this.size * this.size / 100)), c = Math.ceil(10 * camera_zoom) / 10, b.setScale(c), d = b.render(), f = ~~(d.width / c), g = ~~(d.height / c), grid.drawImage(d, ~~this.x - ~~(f / 2), a - ~~(g / 2), f, g));
                    grid.restore()
                }
            }
        };

        Text.prototype = {
            _value: "",
            _color: "#000000",
            _stroke: false,
            _strokeColor: "#000000",
            _size: 16,
            _canvas: null,
            _ctx: null,
            _dirty: false,
            _scale: 1,
            setSize: function(a) {
                this._size != a && (this._size = a, this._dirty = true)
            },
            setScale: function(a) {
                this._scale != a && (this._scale = a, this._dirty = true)
            },
            setColor: function(a) {
                this._color != a && (this._color = a, this._dirty = true)
            },
            setStroke: function(a) {
                this._stroke != a && (this._stroke = a, this._dirty = true)
            },
            setStrokeColor: function(a) {
                this._strokeColor != a && (this._strokeColor = a, this._dirty = true)
            },
            setValue: function(a) {
                a != this._value && (this._value = a, this._dirty = true)
            },
            render: function() {
                null == this._canvas && (this._canvas = document.createElement("canvas"), this._ctx = this._canvas.getContext("2d"));
                if (this._dirty) {
                    this._dirty = false;
                    var a = this._canvas,
                        b = this._ctx,
                        c = this._value,
                        d = this._scale,
                        e = this._size,
                        f = e + "px Ubuntu";
                    b.font = f;
                    var g = b.measureText(c).width,
                        h = ~~(.2 * e);
                    a.width = (g + 6) * d;
                    a.height = (e + h) * d;
                    b.font = f;
                    b.scale(d, d);
                    b.globalAlpha = 1;
                    b.lineWidth = 3;
                    b.strokeStyle = this._strokeColor;
                    b.fillStyle = this._color;
                    this._stroke && b.strokeText(c, 3, e - h / 2);
                    b.fillText(c, 3, e - h / 2)
                }
                return this._canvas
            }
        };

        window.onload = load
    }
})(window, jQuery);