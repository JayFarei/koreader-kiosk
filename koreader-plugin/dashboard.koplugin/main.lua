--[[
Dashboard Kiosk Plugin for KOReader

Displays dashboard images fullscreen with auto-refresh.
Supports multiple stops with physical button navigation.
Place dashboard images at /mnt/us/dashboard/dashboard_1.png, dashboard_2.png, etc.
--]]

local BD = require("ui/bidi")
local Blitbuffer = require("ffi/blitbuffer")
local CenterContainer = require("ui/widget/container/centercontainer")
local Device = require("device")
local Event = require("ui/event")
local FrameContainer = require("ui/widget/container/framecontainer")
local Geom = require("ui/geometry")
local GestureRange = require("ui/gesturerange")
local ImageWidget = require("ui/widget/imagewidget")
local InputContainer = require("ui/widget/container/inputcontainer")
local Size = require("ui/size")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")
local _ = require("gettext")

local Dashboard = WidgetContainer:extend{
    name = "dashboard",
    is_doc_only = false,
}

-- Configuration
local DASHBOARD_DIR = "/mnt/us/dashboard"
local DASHBOARD_PATH_TEMPLATE = DASHBOARD_DIR .. "/dashboard_%d.png"
local DASHBOARD_PATH_LEGACY = DASHBOARD_DIR .. "/dashboard.png"
local CONFIG_PATH = DASHBOARD_DIR .. "/config.txt"
local REFRESH_INTERVAL = 30  -- seconds between refreshes
local FULL_REFRESH_EVERY = 6  -- do full e-ink refresh every N updates

function Dashboard:init()
    self.ui.menu:registerToMainMenu(self)
    self.active = false
    self.refresh_count = 0
    self.current_stop = 1
    self.stop_count = 1
end

function Dashboard:addToMainMenu(menu_items)
    menu_items.dashboard = {
        text = _("Dashboard Kiosk"),
        sorting_hint = "tools",
        sub_item_table = {
            {
                text = _("Start Dashboard"),
                callback = function()
                    self:startDashboard()
                end,
            },
            {
                text = _("Stop Dashboard"),
                callback = function()
                    self:stopDashboard()
                end,
            },
            {
                text = _("Refresh Now"),
                callback = function()
                    self:refreshDashboard(true)
                end,
            },
            {
                text = _("Next Stop"),
                callback = function()
                    self:navigateNext()
                end,
            },
            {
                text = _("Previous Stop"),
                callback = function()
                    self:navigatePrev()
                end,
            },
        },
    }
end

function Dashboard:loadConfig()
    -- Read stop count from config file
    local file = io.open(CONFIG_PATH, "r")
    if file then
        local content = file:read("*all")
        file:close()
        local count = content:match("STOP_COUNT=(%d+)")
        if count then
            self.stop_count = tonumber(count) or 1
            logger.info("Dashboard: Loaded config, stop_count=" .. self.stop_count)
        end
    else
        -- Fallback: count existing dashboard files
        self.stop_count = 1
        for i = 1, 10 do
            local path = string.format(DASHBOARD_PATH_TEMPLATE, i)
            local f = io.open(path, "r")
            if f then
                f:close()
                self.stop_count = i
            else
                break
            end
        end
        logger.info("Dashboard: No config file, detected " .. self.stop_count .. " stops")
    end

    -- Ensure current_stop is valid
    if self.current_stop > self.stop_count then
        self.current_stop = 1
    end
end

function Dashboard:getCurrentImagePath()
    if self.stop_count > 1 then
        return string.format(DASHBOARD_PATH_TEMPLATE, self.current_stop)
    else
        -- Check if numbered file exists, otherwise use legacy
        local numbered_path = string.format(DASHBOARD_PATH_TEMPLATE, 1)
        local file = io.open(numbered_path, "r")
        if file then
            file:close()
            return numbered_path
        end
        return DASHBOARD_PATH_LEGACY
    end
end

function Dashboard:navigateNext()
    if not self.active then return end
    if self.current_stop < self.stop_count then
        self.current_stop = self.current_stop + 1
        logger.info("Dashboard: Navigate to stop " .. self.current_stop)
        self:showDashboard()
        UIManager:setDirty(self.dashboard_widget, "partial")
    end
end

function Dashboard:navigatePrev()
    if not self.active then return end
    if self.current_stop > 1 then
        self.current_stop = self.current_stop - 1
        logger.info("Dashboard: Navigate to stop " .. self.current_stop)
        self:showDashboard()
        UIManager:setDirty(self.dashboard_widget, "partial")
    end
end

function Dashboard:startDashboard()
    if self.active then
        logger.info("Dashboard: Already running")
        return
    end

    logger.info("Dashboard: Starting kiosk mode")
    self.active = true
    self.refresh_count = 0

    -- Load config to get stop count
    self:loadConfig()

    -- Prevent sleep while dashboard is active
    if Device:canPowerOff() then
        Device:setPowerOffTimeout(0)
    end

    -- Show the dashboard
    self:showDashboard()

    -- Schedule periodic refresh
    self:scheduleRefresh()
end

function Dashboard:stopDashboard()
    if not self.active then
        logger.info("Dashboard: Not running")
        return
    end

    logger.info("Dashboard: Stopping kiosk mode")
    self.active = false

    -- Cancel scheduled refresh
    UIManager:unschedule(self.refreshDashboard)

    -- Close dashboard widget
    if self.dashboard_widget then
        UIManager:close(self.dashboard_widget)
        self.dashboard_widget = nil
    end

    -- Re-enable sleep
    if Device:canPowerOff() then
        Device:setPowerOffTimeout(-1)  -- restore default
    end
end

function Dashboard:showDashboard()
    -- Close existing widget if any
    if self.dashboard_widget then
        UIManager:close(self.dashboard_widget)
    end

    local image_path = self:getCurrentImagePath()

    -- Check if image exists
    local file = io.open(image_path, "r")
    if not file then
        logger.warn("Dashboard: Image not found at " .. image_path)
        return
    end
    file:close()

    -- Get screen dimensions
    local screen_size = Device.screen:getSize()

    -- Create image widget (disable cache to reload file each refresh)
    local image = ImageWidget:new{
        file = image_path,
        width = screen_size.w,
        height = screen_size.h,
        scale_factor = 0,  -- auto-scale
        autostretch = true,
        file_do_cache = false,  -- disable caching so we reload from disk
    }

    -- Keep reference to self for callbacks
    local dashboard = self

    -- Wrap in a fullscreen container with gesture and key handlers
    self.dashboard_widget = InputContainer:new{
        dimen = screen_size,
        image,
        -- Physical button events (Kindle Oasis page turn buttons)
        key_events = {
            GotoPrevStop = { { "LPgBack" }, doc = "previous stop" },
            GotoNextStop = { { "LPgFwd" }, doc = "next stop" },
            GotoPrevStopR = { { "RPgBack" }, doc = "previous stop" },
            GotoNextStopR = { { "RPgFwd" }, doc = "next stop" },
        },
        ges_events = {
            -- Tap anywhere to show menu
            TapMenu = {
                GestureRange:new{
                    ges = "tap",
                    range = Geom:new{
                        x = 0, y = 0,
                        w = screen_size.w,
                        h = screen_size.h,
                    },
                },
            },
            -- Long press anywhere to exit kiosk mode
            HoldExit = {
                GestureRange:new{
                    ges = "hold",
                    range = Geom:new{
                        x = 0, y = 0,
                        w = screen_size.w,
                        h = screen_size.h,
                    },
                },
            },
            -- Swipe left/right for navigation
            SwipeNav = {
                GestureRange:new{
                    ges = "swipe",
                    range = Geom:new{
                        x = 0, y = 0,
                        w = screen_size.w,
                        h = screen_size.h,
                    },
                },
            },
        },
    }

    function self.dashboard_widget:onTapMenu()
        -- Show quick menu on tap
        UIManager:sendEvent(Event:new("ShowMenu"))
        return true
    end

    function self.dashboard_widget:onHoldExit()
        -- Long press exits kiosk mode
        logger.info("Dashboard: Long press detected, exiting kiosk mode")
        dashboard:stopDashboard()
        return true
    end

    function self.dashboard_widget:onSwipeNav(_, ges)
        if ges.direction == "west" then
            -- Swipe left = next stop
            dashboard:navigateNext()
            return true
        elseif ges.direction == "east" then
            -- Swipe right = previous stop
            dashboard:navigatePrev()
            return true
        end
        return false
    end

    -- Physical button handlers (Kindle Oasis) - inverted for natural feel
    function self.dashboard_widget:onGotoPrevStop()
        logger.info("Dashboard: LPgBack pressed")
        dashboard:navigateNext()
        return true
    end

    function self.dashboard_widget:onGotoNextStop()
        logger.info("Dashboard: LPgFwd pressed")
        dashboard:navigatePrev()
        return true
    end

    function self.dashboard_widget:onGotoPrevStopR()
        logger.info("Dashboard: RPgBack pressed")
        dashboard:navigateNext()
        return true
    end

    function self.dashboard_widget:onGotoNextStopR()
        logger.info("Dashboard: RPgFwd pressed")
        dashboard:navigatePrev()
        return true
    end

    -- Show fullscreen
    UIManager:show(self.dashboard_widget, "full")
    logger.info("Dashboard: Showing stop " .. self.current_stop .. " of " .. self.stop_count)
end

function Dashboard:refreshDashboard(force_full)
    if not self.active then
        return
    end

    -- Reload config in case stop count changed
    self:loadConfig()

    self.refresh_count = self.refresh_count + 1
    logger.info("Dashboard: Refresh #" .. self.refresh_count)

    -- Determine refresh mode
    local refresh_mode = "partial"
    if force_full or (self.refresh_count % FULL_REFRESH_EVERY == 0) then
        refresh_mode = "full"
        logger.info("Dashboard: Full e-ink refresh")
    end

    -- Reload and display the image
    self:showDashboard()

    -- Force screen refresh
    UIManager:setDirty(self.dashboard_widget, refresh_mode)

    -- Schedule next refresh
    self:scheduleRefresh()
end

function Dashboard:scheduleRefresh()
    if not self.active then
        return
    end

    UIManager:scheduleIn(REFRESH_INTERVAL, function()
        self:refreshDashboard(false)
    end)
end

return Dashboard
