# Ren'Py 8.5+ functional tests; needs a working graphics environment.
testsuite global:
    before testcase:
        if not screen "main_menu":
            run MainMenu(confirm=False)
        click id "start_button" until not screen "main_menu"
        advance until screen "choice"

    testcase send_signal:
        click "Send the signal" until not screen "choice"
        advance until "ENDING: A light across the water."
        assert eval signal_sent is True
        assert eval ending == "light"

    testcase keep_dark:
        click "Keep the station dark" until not screen "choice"
        advance until "ENDING: A promise for tomorrow."
        assert eval signal_sent is False
        assert eval ending == "quiet"

    teardown:
        exit
