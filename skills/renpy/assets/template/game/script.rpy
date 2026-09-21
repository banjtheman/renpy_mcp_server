# Replace the Solid/Text placeholders with selected native ImageGen outputs.
define mira = Character("Mira", color="#efbd79")
define sol = Character("Sol", color="#93d5ca")
default signal_sent = False
default ending = ""

image bg station = Solid("#152b35")
image bg water = Solid("#243447")
image mira neutral = Text("MIRA\n\nplaceholder", size=35, color="#efbd79", text_align=0.5)
image sol neutral = Text("SOL\n\nplaceholder", size=35, color="#93d5ca", text_align=0.5)

transform cast_left:
    xalign 0.25
    yalign 0.45

transform cast_right:
    xalign 0.75
    yalign 0.45

label start:
    $ signal_sent = False
    $ ending = ""
    call station
    call shoreline
    return

label station:
    scene bg station
    show mira neutral at cast_left
    show sol neutral at cast_right
    mira "The receiver woke up at midnight. It has been silent for seventeen years."
    sol "Someone across the water is still listening. We have enough power for one reply."
    menu:
        "Send the signal":
            $ signal_sent = True
            mira "Then let them know the station is still here."
        "Keep the station dark":
            $ signal_sent = False
            sol "We'll keep the battery. Morning will need it more."
    return

label shoreline:
    scene bg water
    "At dawn, they walked down to the seawall."
    if signal_sent:
        call light_ending
    else:
        call quiet_ending
    return

label light_ending:
    $ ending = "light"
    sol "There. By the old ferry dock."
    "ENDING: A light across the water."
    return

label quiet_ending:
    $ ending = "quiet"
    mira "Tomorrow, we bring a second battery."
    "ENDING: A promise for tomorrow."
    return
