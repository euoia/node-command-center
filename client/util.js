define(function() {
  function Util () {
  }

  Util.formatDate = function(dateStr) {
    var d = new Date(dateStr);

    return this.formatNumberLength(d.getHours(), 2) +
      ":" + this.formatNumberLength(d.getMinutes(), 2);
  };

  Util.formatNumberLength = function(num, length) {
    var r = "" + num;
    while (r.length < length) {
      r = "0" + r;
    }

    return r;
  };

  Util.scrollDown = function(selector) {
    // Scroll the selector to the bottom.
    selector.animate({
      scrollTop: 9999999
    }, 400);

    // Clear the animation otherwise the user cannot scroll back up.
    setTimeout(function clearAnimate() {
      selector.animate({}, 1);
    });
  };

  return Util;
});
