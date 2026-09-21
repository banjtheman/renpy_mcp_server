# Standard say/choice/main_menu contracts keep native tests and the bridge useful.
style default:
    font "DejaVuSans.ttf"
    size 28
    color "#f1eee6"

style button:
    padding (24, 14)
    background Solid("#25454d")
    hover_background Solid("#38636c")

style button_text:
    color "#f1eee6"
    hover_color "#ffffff"

screen say(who, what):
    window:
        id "window"
        background Solid("#0b1923ed")
        xfill True
        yalign 1.0
        ysize 205
        padding (70, 25)
        vbox:
            spacing 14
            if who is not None:
                text who id "who" size 26 color "#efbd79"
            text what id "what" size 30

screen choice(items):
    style_prefix "choice"
    vbox:
        xalign 0.5
        yalign 0.47
        spacing 16
        for item in items:
            textbutton item.caption action item.action xsize 610

style choice_button is button
style choice_button_text is button_text

screen main_menu():
    tag menu
    add Solid("#12232d")
    vbox:
        xpos 110
        yalign 0.45
        spacing 25
        text "__PROJECT_TITLE__" size 62 color "#efbd79"
        text "A small Ren'Py story, ready to make your own." size 24
        null height 25
        textbutton "Start" action Start() id "start_button"
        textbutton "Load" action ShowMenu("load")
        textbutton "Preferences" action ShowMenu("preferences")
        if not renpy.variant("web"):
            textbutton "Quit" action Quit(confirm=False)

screen quick_menu():
    zorder 100
    if not main_menu:
        hbox:
            xalign 0.98
            ypos 15
            spacing 8
            textbutton "Back" action Rollback() text_size 18
            textbutton "Save" action ShowMenu("save") text_size 18
            textbutton "Load" action ShowMenu("load") text_size 18
            textbutton "Menu" action ShowMenu("preferences") text_size 18

init python:
    config.overlay_screens.append("quick_menu")

screen preferences():
    tag menu
    add Solid("#12232d")
    vbox:
        xalign 0.5
        yalign 0.5
        spacing 25
        text "Preferences" size 45
        text "Text speed"
        bar value Preference("text speed") xsize 500
        text "Music volume"
        bar value Preference("music volume") xsize 500
        textbutton "Return" action Return()
        if not main_menu:
            textbutton "Main menu" action MainMenu(confirm=False)

screen file_slots(mode):
    add Solid("#12232d")
    vbox:
        xalign 0.5
        yalign 0.5
        spacing 15
        text mode size 45
        for slot in range(1, 5):
            $ slot_name = str(slot)
            textbutton ("Slot " + slot_name + " — " + FileTime(slot_name, empty="Empty")):
                xsize 780
                action (FileSave(slot_name, confirm=False) if mode == "Save" else FileLoad(slot_name, confirm=False))
        textbutton "Return" action Return()

screen save():
    tag menu
    use file_slots("Save")

screen load():
    tag menu
    use file_slots("Load")
